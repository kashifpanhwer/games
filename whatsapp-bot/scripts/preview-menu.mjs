#!/usr/bin/env node
/**
 * Renders the button menu OFFLINE (no WhatsApp connection needed) so you can
 * see exactly what users will receive.
 *
 *   node scripts/preview-menu.mjs            # main menu
 *   node scripts/preview-menu.mjs Downloader # one category sub-menu
 *   node scripts/preview-menu.mjs --json     # raw interactiveMessage payload
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

process.env.SESSION_DIR = process.env.SESSION_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'ktb-preview-'));
process.env.PANEL_ENABLED = 'false';
process.env.COOLDOWN_SECONDS = '0';
process.env.LIMIT_ENABLED = 'false';

const { config } = await import('../src/config.js');
const { load } = await import('../src/database.js');
const { loadPlugins } = await import('../src/plugins.js');
const { handleMessages } = await import('../src/handler.js');
const { serialize } = await import('../lib/functions.js');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const category = argv.find((a) => !a.startsWith('-'));

const captured = [];
const sock = {
  user: { id: `${config.owners[0]}:12@s.whatsapp.net`, name: config.botName },
  async sendMessage(jid, content) { captured.push({ jid, content }); return { key: { id: 'PREVIEW', remoteJid: jid, fromMe: true }, message: content }; },
  async sendPresenceUpdate() {}, async readMessages() {},
  async groupMetadata(jid) { return { id: jid, subject: 'Preview', size: 1, participants: [{ id: `${config.owners[0]}@s.whatsapp.net`, admin: 'superadmin' }] }; },
  async profilePictureUrl() { throw new Error('offline'); },
  async fetchStatus() { return { status: 'preview' }; },
};

load();
await loadPlugins(undefined, { silent: true });

const text = category ? `menu:${category}` : '.menu';
const raw = {
  key: { remoteJid: `${config.owners[0]}@s.whatsapp.net`, fromMe: false, id: 'PREVIEW0001' },
  pushName: config.ownerName,
  message: { interactiveResponseMessage: { nativeFlowResponseMessage: { name: 'quick_reply', paramsJson: JSON.stringify({ id: text.replace(/^menu:/, 'menu:') }) } } },
};

// `.menu` typed normally; a category id arrives as a button press
const inbound = category
  ? raw
  : { key: raw.key, pushName: raw.pushName, message: { conversation: '.menu' } };

await handleMessages(sock, serialize(sock, inbound));

const out = captured.map((c) => c.content);
const interactive = out.find((c) => c?.viewOnceMessage?.message?.interactiveMessage);

if (!interactive) {
  console.log('\n\x1b[33mNo interactive message captured — the bot fell back to plain text:\x1b[0m\n');
  console.log(out.map((c) => c?.text).filter(Boolean).join('\n\n'));
  process.exit(0);
}

if (asJson) {
  console.log(JSON.stringify(interactive, null, 2));
  process.exit(0);
}

const im = interactive.viewOnceMessage.message.interactiveMessage;
const W = 62;
const rule = (ch = '─') => ch.repeat(W);

console.log('\n\x1b[1m\x1b[36m' + rule('═') + '\x1b[0m');
console.log('\x1b[1m  WHATSAPP PREVIEW — interactiveMessage (button menu)\x1b[0m');
console.log('\x1b[1m\x1b[36m' + rule('═') + '\x1b[0m\n');

if (im.header?.title) console.log(`\x1b[1m${im.header.title}\x1b[0m` + (im.header.subtitle ? `   \x1b[90m${im.header.subtitle}\x1b[0m` : ''));
console.log();
console.log(im.body?.text || '');
console.log();

const buttons = im.nativeFlowMessage?.buttons || [];
if (buttons.length) {
  console.log('\x1b[90m' + rule() + '\x1b[0m');
  console.log('\x1b[1m TAPPABLE BUTTONS\x1b[0m');
  console.log('\x1b[90m' + rule() + '\x1b[0m');
  buttons.forEach((b, i) => {
    let p = {};
    try { p = JSON.parse(b.buttonParamsJson || '{}'); } catch { /* keep {} */ }
    if (b.name === 'single_select') {
      console.log(`  ${String(i + 1).padStart(2)}. \x1b[32m▾ ${p.title}\x1b[0m  \x1b[90m[dropdown list]\x1b[0m`);
      p.sections?.forEach((s) => {
        console.log(`       \x1b[1m${s.title}\x1b[0m`);
        s.rows?.slice(0, 6).forEach((r) => console.log(`         • ${r.title}  \x1b[90m— ${r.description || ''}\x1b[0m`));
        if ((s.rows?.length || 0) > 6) console.log(`         \x1b[90m… +${s.rows.length - 6} more\x1b[0m`);
      });
    } else {
      const label = p.display_text || p.title || b.name;
      const id = p.id || p.url || '';
      console.log(`  ${String(i + 1).padStart(2)}. \x1b[36m[ ${label} ]\x1b[0m${p.description ? `  \x1b[90m${p.description}\x1b[0m` : ''}`);
      console.log(`      \x1b[90mid → ${id}\x1b[0m`);
    }
  });
}

if (im.footer?.text) console.log(`\n\x1b[90m${im.footer.text}\x1b[0m`);
console.log('\n\x1b[1m\x1b[36m' + rule('═') + '\x1b[0m');
console.log(`\x1b[32m✔ ${buttons.length} buttons rendered inside a native WhatsApp interactiveMessage\x1b[0m`);
console.log(`\x1b[90m  Sent wrapped in viewOnceMessage so the buttons appear on real clients.\x1b[0m\n`);
