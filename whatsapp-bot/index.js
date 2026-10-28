#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 *   ⚡ KASHIF TECH ADVANCE BOT  v2.0.0
 *
 *   Advanced multi-device WhatsApp bot
 *   • pairing-code login  (Link with phone number)
 *   • QR-code login       (fallback)
 *   • button / carousel / list menus
 *   • hot-reloadable plugin system
 *   • live web control panel
 * ══════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, normalizeNumber } from './src/config.js';
import { load } from './src/database.js';
import { loadPlugins, stats } from './src/plugins.js';
import { pushLog, connState } from './src/state.js';
import { startPanel, stopPanel } from './src/panel.js';
import { startConnection, restart } from './src/connection.js';
import { banner } from './lib/functions.js';

/* ──────────────────────── CLI flags ──────────────────────── */
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => {
  const i = argv.indexOf(f);
  return i > -1 ? argv[i + 1] : null;
};

let mode = config.authMode;
if (has('--pair')) mode = 'pair';
if (has('--qr')) mode = 'qr';
const numberArg = valueOf('--number') || valueOf('-n');
if (numberArg) config.pairingNumber = normalizeNumber(numberArg);
const panelOnly = has('--panel-only');

/* ──────────────────────── boot ──────────────────────── */
async function boot() {
  console.log('\n' + banner() + '\n');

  fs.mkdirSync(config.sessionDir, { recursive: true });
  fs.mkdirSync(path.join(config.root, 'tmp'), { recursive: true });
  load();
  pushLog('info', `Database ready → ${path.join(config.sessionDir, 'database.json')}`);

  const res = await loadPlugins();
  const s = stats();
  connState.plugins = s.total;
  connState.groups = 0;
  pushLog('ok', `${s.total} plugins • ${s.commands} command triggers • ${s.categories} menu categories`);
  if (res.failed.length) pushLog('warn', `${res.failed.length} plugin issue(s) — see below`);
  res.failed.slice(0, 10).forEach((f) => pushLog('error', '  ' + f));

  startPanel();

  if (panelOnly) {
    pushLog('info', 'Panel-only mode — not connecting to WhatsApp.');
    return;
  }

  const hasSession = fs.existsSync(path.join(config.sessionDir, 'creds.json')) &&
    (() => { try { return !!JSON.parse(fs.readFileSync(path.join(config.sessionDir, 'creds.json'), 'utf8')).registered; } catch { return false; } })();

  if (hasSession) {
    pushLog('info', 'Existing session found — reconnecting without a new pairing code.');
  } else if (mode === 'pair') {
    pushLog('info', `Pair mode: a code will be requested for +${config.pairingNumber}`);
  }

  await startConnection({ forceMode: mode });
}

/* ──────────────────────── process safety ──────────────────────── */
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) process.exit(0);
  shuttingDown = true;
  pushLog('warn', `${signal} received — saving state and closing…`);
  try {
    const { flush } = await import('./src/database.js');
    flush();
    await stopPanel();
  } catch { /* ignore */ }
  setTimeout(() => process.exit(0), 1500);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => pushLog('error', `unhandled rejection: ${e?.message || e}`));
process.on('uncaughtException', (e) => pushLog('error', `uncaught exception: ${e?.message || e}`));

boot().catch((err) => {
  console.error('\n\x1b[31mFATAL BOOT ERROR\x1b[0m');
  console.error(err);
  process.exit(1);
});

export { restart };
