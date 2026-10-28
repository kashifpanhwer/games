#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 *  DOCTOR — "mera pair code kyun nahi aa raha?" ka jawab
 *
 *  Runs every check the bot needs before it can obtain a pairing
 *  code, in the exact order WhatsApp requires them, and tells you
 *  precisely which one fails and how to fix it.
 *
 *     npm run doctor
 * ══════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[90m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const ok = (s) => `${C.green}✔${C.reset} ${s}`;
const bad = (s) => `${C.red}✖${C.reset} ${s}`;
const warn = (s) => `${C.yellow}⚠${C.reset} ${s}`;
const head = (s) => `\n${C.cyan}${C.bold}── ${s} ${'─'.repeat(Math.max(2, 58 - s.length))}${C.reset}`;

const results = [];
function record(name, pass, detail, fix) {
  results.push({ name, pass, detail, fix });
  console.log(`   ${pass ? ok(name) : bad(name)}`);
  if (detail) console.log(`     ${C.dim}${detail}${C.reset}`);
}

const WA_HOSTS = [
  { host: 'web.whatsapp.com', port: 443, why: 'WebSocket + pairing registration (the one that matters)' },
  { host: 'g.whatsapp.com', port: 443, why: 'media upload/download servers' },
  { host: 'pps.whatsapp.net', port: 443, why: 'profile pictures' },
];

async function withTimeout(promise, ms, label) {
  let t;
  try {
    return await Promise.race([
      promise,
      new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms); }),
    ]);
  } finally { clearTimeout(t); }
}

console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════╗
║   ⚕  KASHIF TECH ADVANCE BOT — DOCTOR                     ║
╚══════════════════════════════════════════════════════════╝${C.reset}`);
console.log(`${C.dim}   host: ${os.hostname()}   platform: ${os.platform()}/${os.arch()}   node: ${process.version}${C.reset}`);

/* ═══════════ 1. RUNTIME ═══════════ */
console.log(head('1. RUNTIME'));

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
record('Node.js >= 20', nodeMajor >= 20, `running v${process.versions.node}`,
  nodeMajor < 20 ? 'Upgrade Node: https://nodejs.org (Termux: pkg install nodejs-lts)' : null);

const isTermux = !!process.env.PREFIX && process.env.PREFIX.includes('com.termux');
const isRoot = (() => { try { return process.getuid?.() === 0; } catch { return false; } })();
console.log(`   ${C.dim}environment: ${isTermux ? 'Termux (Android)' : isRoot ? 'container/root' : 'normal user'}${C.reset}`);

/* ═══════════ 2. PROJECT ═══════════ */
console.log(head('2. PROJECT FILES'));

const HERE = import.meta.dirname || path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const has = (rel) => fs.existsSync(path.join(ROOT, rel));

record('node_modules installed', has('node_modules/@whiskeysockets/baileys'),
  has('node_modules/@whiskeysockets/baileys') ? '@whiskeysockets/baileys present' : 'not installed',
  has('node_modules/@whiskeysockets/baileys') ? null : 'Run: npm install');

const envPath = path.join(ROOT, '.env');
const envExists = fs.existsSync(envPath);
let env = {};
if (envExists) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
record('.env exists', envExists, envExists ? `${Object.keys(env).length} keys read` : 'using built-in defaults',
  envExists ? null : 'Run: cp .env.example .env  (the bot still works on defaults, but you cannot edit them)');

/* ═══════════ 3. CONFIG ═══════════ */
console.log(head('3. CONFIGURATION'));

const num = (env.PAIRING_NUMBER || '923145396910').replace(/\D/g, '');
const validNum = num.length >= 10 && num.length <= 15 && !num.startsWith('0');
record('PAIRING_NUMBER looks valid', validNum, `+${num}  (${num.length} digits)`,
  validNum ? null : 'Must be country code + number, digits only. Pakistan: 923xxxxxxxxx (NOT 03xxxxxxxxx)');

const cpc = (env.CUSTOM_PAIRING_CODE || '').trim();
if (cpc) {
  const legal = /^[A-HJ-NP-Z0-9]{8}$/.test(cpc);
  record('CUSTOM_PAIRING_CODE legal', legal, `"${cpc}" — must be exactly 8 chars, A-Z/0-9, no I L O U`,
    legal ? null : 'WhatsApp rejects I, L, O and U. Leave it blank for a random code.');
} else {
  console.log(`   ${C.dim}   CUSTOM_PAIRING_CODE: (blank → WhatsApp generates a random code)${C.reset}`);
}

if (env.PANEL_TOKEN === 'kashiftech' || !env.PANEL_TOKEN) {
  console.log(`   ${warn('PANEL_TOKEN is still the default "kashiftech" — change it if this box is public')}`);
}

const sessDir = env.SESSION_DIR ? path.resolve(ROOT, env.SESSION_DIR) : path.join(ROOT, 'sessions');
const credsPath = path.join(sessDir, 'creds.json');
let registered = false;
if (fs.existsSync(credsPath)) {
  try { registered = !!JSON.parse(fs.readFileSync(credsPath, 'utf8')).registered; } catch { registered = false; }
}
record('session state', true,
  fs.existsSync(credsPath)
    ? (registered ? `${credsPath} — already REGISTERED, no pairing needed` : `${credsPath} — exists but not registered yet`)
    : `no session yet (${sessDir}) — first run will request a pairing code`,
  null);

/* ═══════════ 4. FFMPEG ═══════════ */
console.log(head('4. MEDIA PIPELINE (ffmpeg)'));

let ff = null;
try {
  ff = (await import('@ffmpeg-installer/ffmpeg')).default.path;
} catch { /* ignore */ }
record('bundled ffmpeg binary', !!ff && fs.existsSync(ff), ff || 'not found',
  ff ? null : 'Run: npm install @ffmpeg-installer/ffmpeg');

if (ff) {
  const run = (args) => { try { return execFileSync(ff, args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return `${e.stdout || ''}${e.stderr || ''}`; } };
  const filters = run(['-hide_banner', '-filters']);
  record('drawtext filter (for .attp)', /drawtext/.test(filters), 'renders text into stickers',
    /drawtext/.test(filters) ? null : 'Install a full ffmpeg build, or use system ffmpeg (Termux: pkg install ffmpeg)');
  const encoders = run(['-hide_banner', '-encoders']);
  record('libwebp encoder (for stickers)', /libwebp/.test(encoders), 'encodes 512x512 WebP',
    /libwebp/.test(encoders) ? null : 'Your ffmpeg lacks libwebp — sticker commands will fail');
  record('libx264 encoder (for .togif)', /libx264/.test(encoders), 'encodes MP4 from WebP',
    /libx264/.test(encoders) ? null : 'Animated sticker → video will fail (non-critical)');
}

/* ═══════════ 5. NETWORK — THE DECISIVE PART ═══════════ */
console.log(head('5. NETWORK TO WHATSAPP'));
console.log(`   ${C.dim}This is where pairing-code problems always live. Each step must pass.${C.reset}`);

let netOk = true;

for (const { host, port, why } of WA_HOSTS) {
  // 5a DNS
  let addrs = [];
  try {
    addrs = (await withTimeout(dns.lookup(host, { all: true }), 8000, 'DNS')).map((a) => a.address);
  } catch (e) {
    record(`DNS: ${host}`, false, e.message, 'Check your DNS (Termux: try 1.1.1.1). Some networks block WhatsApp DNS.');
    netOk = false;
    continue;
  }
  const v4 = addrs.filter((a) => a.includes('.'));
  const v6 = addrs.filter((a) => a.includes(':'));
  record(`DNS: ${host}`, true, `${addrs.length} address(es) — IPv4: ${v4.length}, IPv6: ${v6.length}   ${C.dim}(${why})${C.reset}`);

  if (!v4.length && v6.length) {
    console.log(`   ${warn(`${host} resolved to IPv6 only — mobile networks often fail here.`)}`);
    console.log(`     ${C.dim}fix: run node with  --dns-result-order=ipv4first${C.reset}`);
  }

  // 5b TCP
  const target = v4[0] || v6[0];
  let tcpOk = false;
  try {
    await withTimeout(new Promise((res, rej) => {
      const s = net.connect({ host: target, port, family: v4[0] ? 4 : 6 });
      s.once('connect', () => { tcpOk = true; s.destroy(); res(); });
      s.once('error', rej);
    }), 8000, 'TCP');
  } catch (e) {
    record(`TCP ${target}:${port}`, false, e.message, 'A firewall, VPN or restricted network is blocking outbound 443.');
    netOk = false;
    continue;
  }
  record(`TCP ${target}:${port}`, tcpOk, 'socket established');

  // 5c TLS — the check that separates "port open" from "actually usable"
  let tlsInfo = null;
  try {
    tlsInfo = await withTimeout(new Promise((res, rej) => {
      const s = tls.connect({ host: target, port, servername: host, family: v4[0] ? 4 : 6, rejectUnauthorized: true });
      s.once('secureConnect', () => {
        const cert = s.getPeerCertificate();
        const info = { issuer: cert?.issuer?.O, subject: cert?.subject?.CN, protocol: s.getProtocol() };
        s.destroy(); res(info);
      });
      s.once('error', rej);
    }), 10000, 'TLS');
  } catch (e) {
    record(`TLS handshake: ${host}`, false,
      `${e.message}  ${C.dim}(TCP opened but the encrypted handshake was killed — this is a sandbox/firewall TLS block)${C.reset}`,
      'The machine running the bot must be allowed to complete TLS to WhatsApp. ' +
      'Sandboxes, CI runners and some corporate/ISP filters do exactly this. ' +
      'Run the bot on your own phone (Termux), PC or VPS instead.');
    netOk = false;
    continue;
  }
  record(`TLS handshake: ${host}`, true, `${tlsInfo.protocol} — cert issued by ${tlsInfo.issuer}`);
}

// 5d the real WebSocket upgrade Baileys performs
if (netOk) {
  try {
    const { default: WebSocket } = await import('ws');
    const res = await withTimeout(new Promise((res, rej) => {
      const ws = new WebSocket('wss://web.whatsapp.com/ws/chat', {
        headers: { Origin: 'https://web.whatsapp.com' },
        handshakeTimeout: 12000,
      });
      ws.once('open', () => { ws.terminate(); res('open'); });
      ws.once('unexpected-response', (_r, response) => { ws.terminate(); rej(new Error(`HTTP ${response.statusCode} instead of a WebSocket upgrade`)); });
      ws.once('error', rej);
    }), 15000, 'WebSocket');
    record('WebSocket upgrade to wss://web.whatsapp.com/ws/chat', true, `socket ${res} — pairing registration is possible`);
  } catch (e) {
    record('WebSocket upgrade to wss://web.whatsapp.com/ws/chat', false, e.message,
      'Without this socket, requestPairingCode() can never reach WhatsApp.');
    netOk = false;
  }
} else {
  console.log(`   ${C.dim}   (WebSocket test skipped — an earlier network step already failed)${C.reset}`);
}

/* ═══════════ 6. PANEL PORT ═══════════ */
console.log(head('6. WEB PANEL'));
// process.env wins over .env so `PANEL_PORT=3111 npm run doctor` is honoured
const port = parseInt(process.env.PANEL_PORT || env.PANEL_PORT || '3000', 10);
const bindHost = process.env.PANEL_HOST || env.PANEL_HOST || '0.0.0.0';
const portFree = await new Promise((res) => {
  const s = net.createServer();
  s.once('error', () => res(false));
  s.once('listening', () => s.close(() => res(true)));
  s.listen(port, bindHost);
});
if (portFree) {
  record(`port ${port} available`, true, 'the control panel can bind');
} else {
  // Not a blocker — it almost always means the bot is already running.
  console.log(`   ${warn(`port ${port} is busy — the bot is probably already running`)}`);
  console.log(`     ${C.dim}open http://localhost:${port}/?token=<PANEL_TOKEN> in your browser${C.reset}`);
}

/* ═══════════ VERDICT ═══════════ */
const failed = results.filter((r) => !r.pass);
const W = 60;
console.log(`\n${C.bold}${'═'.repeat(W)}${C.reset}`);
if (!failed.length) {
  console.log(`${C.green}${C.bold}  ✅ ALL CLEAR — this machine can obtain a pairing code.${C.reset}`);
  console.log(`\n  Run:\n    ${C.cyan}npm run pair${C.reset}\n`);
  console.log(`  Then on the phone:\n    WhatsApp ▸ Settings ▸ Linked Devices ▸ Link a Device\n    ▸ "Link with phone number instead" ▸ type the 8 characters\n`);
} else {
  console.log(`${C.red}${C.bold}  ❌ ${failed.length} check(s) failed — a pairing code CANNOT be issued here.${C.reset}`);
  console.log(`\n  ${C.bold}What failed:${C.reset}`);
  failed.forEach((f) => console.log(`    • ${f.name}\n      ${C.dim}${String(f.detail).replace(/\x1b\[[0-9;]*m/g, '').slice(0, 220)}${C.reset}`));
  console.log(`\n  ${C.bold}How to fix it:${C.reset}`);
  [...new Set(failed.map((f) => f.fix).filter(Boolean))].forEach((f, i) => console.log(`    ${i + 1}. ${f}`));
  console.log(`\n  ${C.bold}Where it WILL work:${C.reset}`);
  console.log(`    • Termux on your Android phone   →  ${C.cyan}bash scripts/install-termux.sh${C.reset}`);
  console.log(`    • your own PC / laptop           →  ${C.cyan}npm install && npm run pair${C.reset}`);
  console.log(`    • any VPS (Contabo, DigitalOcean, Hetzner…)  → same command over SSH`);
  console.log(`\n  ${C.dim}A pairing code is issued by WhatsApp's servers, not generated locally.`);
  console.log(`  Any code produced on a machine that cannot complete TLS to${C.reset}`);
  console.log(`  ${C.dim}web.whatsapp.com will be rejected as invalid by the phone.${C.reset}`);
}
console.log(`${C.bold}${'═'.repeat(W)}${C.reset}`);
console.log(`\n${C.dim}  ${results.filter((r) => r.pass).length}/${results.length} checks passed${C.reset}\n`);

process.exit(failed.length ? 1 : 0);
