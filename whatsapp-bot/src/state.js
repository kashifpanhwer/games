import { EventEmitter } from 'node:events';

/**
 * Live, in-memory state shared by the connection manager, the command
 * handler and the web panel. Everything here is also exposed over
 * Server-Sent Events so the panel updates without polling.
 */
export const events = new EventEmitter();
events.setMaxListeners(50);

export const connState = {
  status: 'idle',        // idle | connecting | pairing | await-pair | pair-failed | qr | open | closed | loggedOut
  mode: null,            // 'pair' | 'qr'
  pairingCode: null,     // raw 8-char code
  pairingCodePretty: null,
  pairingNumber: null,
  pairingIssuedAt: null,
  qrRaw: null,
  qrDataUrl: null,
  me: null,              // { jid, number, name }
  lastError: null,
  reconnects: 0,
  startedAt: Date.now(),
  connectedAt: null,
  logs: [],
  contacts: new Map(),
  messages: 0,
  commands: 0,
  groups: 0,
  plugins: 0,
};

const MAX_LOGS = 300;

export function pushLog(level, message, meta = {}) {
  const entry = { level, message, t: Date.now(), ...meta };
  connState.logs.push(entry);
  if (connState.logs.length > MAX_LOGS) connState.logs.shift();
  const icon = { info: 'ℹ', warn: '⚠', error: '✖', ok: '✔', pair: '🔑' }[level] || '•';
  const color = { info: '\x1b[90m', warn: '\x1b[33m', error: '\x1b[31m', ok: '\x1b[32m', pair: '\x1b[35m' }[level] || '';
  const time = new Date(entry.t).toISOString().slice(11, 19);
  console.log(`${color}[${time}] ${icon} ${message}\x1b[0m`);
  events.emit('log', entry);
}

export function setPairingCode(code, pretty) {
  connState.pairingCode = code;
  connState.pairingCodePretty = pretty || null;
  connState.pairingIssuedAt = code ? Date.now() : null;
  events.emit('pairing', { code, pretty });
}

export function snapshot() {
  return {
    status: connState.status,
    mode: connState.mode,
    pairingCode: connState.pairingCode,
    pairingCodePretty: connState.pairingCodePretty,
    pairingNumber: connState.pairingNumber,
    pairingIssuedAt: connState.pairingIssuedAt,
    qrDataUrl: connState.qrDataUrl,
    me: connState.me,
    lastError: connState.lastError,
    reconnects: connState.reconnects,
    startedAt: connState.startedAt,
    connectedAt: connState.connectedAt,
    uptimeMs: (connState.connectedAt ? Date.now() - connState.connectedAt : 0),
    counters: { messages: connState.messages, commands: connState.commands, groups: connState.groups, plugins: connState.plugins || 0 },
    logs: connState.logs.slice(-80),
  };
}

export default { events, connState, pushLog, setPairingCode, snapshot };
