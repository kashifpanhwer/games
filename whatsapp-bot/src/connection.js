import pino from 'pino';
import fs from 'node:fs';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestWaWebVersion,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';
import { config } from './config.js';
import { connState, pushLog, setPairingCode } from './state.js';
import { handleMessages } from './handler.js';
import { serialize } from '../lib/functions.js';

/**
 * ─────────────────────────────────────────────────────────────
 *  CONNECTION MANAGER
 *  • pairing-code login (Link with phone number)  ← default
 *  • QR-code login fallback
 *  • auto reconnect with exponential backoff
 *  • every credential / pairing event is mirrored into `connState`
 *    so the web panel can show it live
 * ─────────────────────────────────────────────────────────────
 */

export let sock = null;

const logger = pino({ level: 'silent' });

let reconnects = 0;
let restartTimer = null;
let pairingRequested = false;
let pairFailCount = 0;

function authFolderExists() {
  try {
    const f = config.sessionDir;
    if (!fs.existsSync(f)) return false;
    // Baileys 7 stores creds under <dir>/creds.json
    return fs.existsSync(`${f}/creds.json`);
  } catch {
    return false;
  }
}

async function resolveVersion() {
  try {
    const v = await fetchLatestWaWebVersion(logger);
    if (v?.version) return v.version;
  } catch (err) {
    pushLog('warn', `Could not fetch latest WA Web version (${err.message}); using bundled default.`);
  }
  return undefined;
}

export async function startConnection({ forceMode } = {}) {
  const mode = (forceMode || config.authMode || 'pair').toLowerCase();
  fs.mkdirSync(config.sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
  const version = await resolveVersion();

  connState.mode = mode;
  connState.status = 'connecting';
  connState.startedAt = Date.now();
  connState.lastError = null;
  pushLog('info', `Starting socket (auth mode: ${mode}, session: ${config.sessionDir})`);

  const sockConfig = {
    logger,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false, // deprecated in 7.x; QR arrives via connection.update
    markOnlineOnConnect: true,
    syncFullHistory: false,
    fireInitQueries: true,
    generateHighQualityLinkPreview: true,
    emitOwnEvents: true,
    defaultQueryTimeoutMs: 60_000,
    connectTimeoutMs: 60_000,
    qrTimeout: 60_000,
    getMessage: async () => ({ conversation: '' }),
    ...(version ? { version } : {}),
  };

  const client = makeWASocket(sockConfig);
  sock = client;
  globalThis.sock = client;

  // ───────────── connection state machine ─────────────
  client.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connState.qrRaw = qr;
      try {
        connState.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 480, errorCorrectionLevel: 'L' });
      } catch {
        connState.qrDataUrl = null;
      }
      connState.status = 'qr';
      pushLog('info', 'QR code received — scan it in WhatsApp ▸ Linked Devices.');
      renderQrInTerminal(qr);
    }

    // Pairing code: request it as soon as the socket is connected but unregistered.
    if (mode === 'pair' && !state.creds.registered && !pairingRequested && connection !== 'open') {
      if (connection === 'connecting' || connection === undefined) {
        pairingRequested = true;
        await requestPairing(client, state);
      }
    }

    if (connection === 'connecting') {
      connState.status = 'connecting';
      pushLog('info', 'Connecting to WhatsApp servers…');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : lastDisconnect?.error?.output?.statusCode) || DisconnectReason.connectionClosed;
      connState.status = 'closed';
      connState.lastError = `closed (${statusCode})`;
      pairingRequested = false;
      pushLog('warn', `Connection closed — code ${statusCode}`);

      if (statusCode === DisconnectReason.loggedOut) {
        connState.status = 'loggedOut';
        pushLog('error', 'Session logged out. Delete the sessions folder and re-pair.');
        setPairingCode(null);
        return; // do NOT reconnect — the creds are dead
      }
      scheduleRestart(mode);
    }

    if (connection === 'open') {
      connState.status = 'open';
      connState.pairingCode = null;
      connState.qrDataUrl = null;
      connState.connectedAt = Date.now();
      reconnects = 0;
      pairFailCount = 0;
      const me = client.user;
      connState.me = me
        ? {
            jid: jidNormalizedUser(me.id || ''),
            number: String(me.id || '').split('@')[0].split(':')[0],
            name: me.name || me.verifiedName || config.botName,
          }
        : null;
      pushLog('info', `✅ Connected as ${connState.me?.name} (+${connState.me?.number || '?'})`);
      printBanner(`Connected  →  +${connState.me?.number || '?'}`);
    }
  });

  client.ev.on('creds.update', () => {
    saveCreds().catch((e) => pushLog('error', `creds save failed: ${e.message}`));
  });

  // ───────────── incoming messages ─────────────
  client.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;
    for (const raw of messages) {
      try {
        const m = serialize(client, raw);
        if (!m || !m.message) continue;
        await handleMessages(client, m);
      } catch (err) {
        pushLog('error', `handler crashed: ${err.stack?.split('\n')[0] || err.message}`);
      }
    }
  });

  client.ev.on('messages.update', async (updates) => {
    try {
      const { handleMessageUpdate } = await import('./handler.js');
      await handleMessageUpdate(client, updates);
    } catch { /* optional */ }
  });

  client.ev.on('group-participants.update', async (evt) => {
    try {
      const { handleParticipants } = await import('./group-events.js');
      await handleParticipants(client, evt);
    } catch (err) {
      pushLog('error', `participants event failed: ${err.message}`);
    }
  });

  client.ev.on('call', async (calls) => {
    try {
      const { handleCall } = await import('./call-events.js');
      await handleCall(client, calls);
    } catch { /* optional */ }
  });

  client.ev.on('contacts.update', (contacts) => {
    for (const c of contacts) connState.contacts.set(c.id, c.notify || c.name || c.verifiedName || '');
  });

  client.waitForConnectionUpdate?.((isOpen) => isOpen).catch(() => {});

  return client;
}

async function requestPairing(client, state) {
  const number = config.pairingNumber;
  if (!number || number.length < 8) {
    connState.lastError = 'PAIRING_NUMBER missing/invalid in .env';
    pushLog('error', 'PAIRING_NUMBER is missing or invalid — cannot request a pairing code.');
    return;
  }
  connState.status = 'pairing';
  pushLog('info', `Requesting pairing code for +${number} …`);

  try {
    const custom = config.customPairingCode && config.customPairingCode.length === 8
      ? config.customPairingCode
      : undefined;
    const code = await client.requestPairingCode(number, custom);
    const pretty = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    setPairingCode(code, pretty);
    connState.pairingNumber = number;
    connState.status = 'awaiting-pair';
    pushLog('info', `Pairing code issued: ${pretty}`);
    printPairingCode(pretty, number);
  } catch (err) {
    const msg = err?.message || String(err);
    const status = err?.output?.statusCode || err?.statusCode || err?.data?.statusCode;
    connState.lastError = `pairing failed: ${msg}`;
    connState.status = 'pair-failed';
    pairFailCount += 1;
    pushLog('error', `Could not obtain a pairing code — ${msg}`);
    // The full explainer is only worth printing a couple of times; after that
    // keep the retry loop quiet so the log stays readable.
    if (pairFailCount <= 2) printPairingFailure(msg);
    else if (pairFailCount === 3) pushLog('warn', `Still cannot reach WhatsApp — retrying silently (attempt #${pairFailCount}).`);
    pairingRequested = true;

    // Only switch to QR when WhatsApp itself refused the registration
    // (401/403 = bad number or account restriction). A transport-level
    // failure means neither code nor QR can work yet, so stay in pair mode
    // and keep retrying — that way the code appears as soon as the network
    // comes back, without the user having to restart anything.
    const registrationRefused = [401, 403].includes(Number(status));
    if (registrationRefused) {
      pushLog('warn', 'WhatsApp refused the pairing registration — falling back to QR mode.');
      pushLog('warn', 'Check the number (country code, digits only) or that it is not already linked.');
      scheduleRestart('qr');
    } else {
      scheduleRestart('pair');
    }
  }
}

function scheduleRestart(mode) {
  if (restartTimer) return;
  reconnects += 1;
  const wait = Math.min(1000 * 2 ** Math.min(reconnects, 5), 30_000);
  connState.reconnects = reconnects;
  pushLog('info', `Reconnecting in ${(wait / 1000).toFixed(1)}s (attempt #${reconnects})`);
  restartTimer = setTimeout(async () => {
    restartTimer = null;
    try {
      await sock?.end?.(undefined);
    } catch { /* ignore */ }
    try {
      await startConnection({ forceMode: mode });
    } catch (err) {
      pushLog('error', `restart failed: ${err.message}`);
      scheduleRestart(mode);
    }
  }, wait);
}

export async function restart(mode) {
  pairingRequested = false;
  connState.pairingCode = null;
  connState.qrDataUrl = null;
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  try { await sock?.end?.(undefined); } catch { /* ignore */ }
  return startConnection({ forceMode: mode || config.authMode });
}

export async function logout() {
  try { await sock?.logout?.(); } catch { /* ignore */ }
  if (fs.existsSync(config.sessionDir)) fs.rmSync(config.sessionDir, { recursive: true, force: true });
  connState.status = 'loggedOut';
  setPairingCode(null);
  pushLog('warn', 'Logged out — session folder deleted.');
}

/* ─────────────────────────  terminal rendering  ───────────────────────── */

function printBanner(line) {
  console.log(`\n\x1b[36m╔══════════════════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  \x1b[1m⚡ ${config.botName.toUpperCase()} v${config.versionLabel}\x1b[0m`.padEnd(60) + '\x1b[36m║\x1b[0m');
  console.log(`\x1b[36m║\x1b[0m  ${line}`.padEnd(59) + '\x1b[36m║\x1b[0m');
  console.log(`\x1b[36m╚══════════════════════════════════════════════════════════╝\x1b[0m\n`);
}

function printPairingCode(pretty, number) {
  const box = [
    '',
    '\x1b[43m\x1b[30m                                                          \x1b[0m',
    `\x1b[43m\x1b[30m   YOUR WHATSAPP PAIRING CODE :   ${pretty.padEnd(24)}\x1b[0m`,
    `\x1b[43m\x1b[30m   FOR NUMBER               :   +${String(number).padEnd(25)}\x1b[0m`,
    '\x1b[43m\x1b[30m                                                          \x1b[0m',
    '',
    '\x1b[36m   How to link:\x1b[0m',
    '   1. Open WhatsApp on that phone',
    '   2. Settings  ▸  Linked Devices  ▸  Link a Device',
    '   3. Tap "Link with phone number instead"',
    `   4. Enter the code: \x1b[1m${pretty}\x1b[0m`,
    '',
];
  console.log(box.join('\n'));
}

function printPairingFailure(msg) {
  console.log(`
\x1b[41m\x1b[37m  PAIRING CODE UNAVAILABLE                                  \x1b[0m
  ${msg.slice(0, 78)}

  A pairing code can only be issued while this process has a live,
  encrypted connection to WhatsApp's servers (wss://web.whatsapp.com).
  Check your network/firewall, then re-run:  npm run pair
`);
}

async function renderQrInTerminal(qr) {
  try {
    const text = await QRCode.toString(qr, { type: 'terminal', small: true, margin: 1 });
    console.log('\n\x1b[36m  Scan this QR code with WhatsApp ▸ Linked Devices ▸ Link a Device\x1b[0m\n');
    console.log(text);
  } catch { /* ignore */ }
}

export default { startConnection, restart, logout, get sock() { return sock; } };
