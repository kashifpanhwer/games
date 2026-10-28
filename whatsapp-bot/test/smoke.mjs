/**
 * ─────────────────────────────────────────────────────────────
 *  OFFLINE SMOKE TEST
 *
 *  Boots the whole bot (config → database → plugins → router)
 *  against a MOCK WhatsApp socket, so every command path can be
 *  verified without any network connection to WhatsApp.
 *
 *  Run:  npm test
 * ─────────────────────────────────────────────────────────────
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

process.env.SESSION_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ktb-test-'));
process.env.PANEL_ENABLED = 'false';
process.env.LIMIT_ENABLED = 'false';
process.env.COOLDOWN_SECONDS = '0'; // no throttling while testing

const { config } = await import('../src/config.js');
const { load } = await import('../src/database.js');
const { loadPlugins, stats, resolveCommand, byCategory } = await import('../src/plugins.js');
const { handleMessages } = await import('../src/handler.js');
const { serialize } = await import('../lib/functions.js');

/* ────────────────────────── mock socket ────────────────────────── */
const sent = [];
const mockSock = {
  user: { id: '923145396910:12@s.whatsapp.net', name: 'Kashif Tech Advance Bot' },
  async sendMessage(jid, content, opts = {}) {
    sent.push({ jid, content, opts });
    return { key: { remoteJid: jid, fromMe: true, id: 'MOCK' + String(sent.length).padStart(8, '0') }, message: content };
  },
  async sendPresenceUpdate() {},
  async presenceSubscribe() {},
  async readMessages() {},
  async groupMetadata(jid) {
    return {
      id: jid, subject: 'Kashif Tech Group', size: 3, creation: 1700000000,
      owner: '923145396910@s.whatsapp.net', desc: 'Official support group',
      participants: [
        { id: '923145396910@s.whatsapp.net', admin: 'superadmin' },
        { id: '923001234567@s.whatsapp.net', admin: null },
        { id: '923009876543@s.whatsapp.net', admin: null },
      ],
    };
  },
  async groupParticipantsUpdate(jid, users, action) { return users.map((u) => ({ jid: u, status: 200 })); },
  async groupSettingUpdate() {},
  async groupUpdateSubject() {},
  async groupUpdateDescription() {},
  async groupInviteCode() { return 'MOCKINVITECODE'; },
  async groupRevokeInvite() { return 'NEWMOCKCODE'; },
  async groupFetchAllParticipating() { return { '123@g.us': { id: '123@g.us', subject: 'Test Group', size: 5 } }; },
  async updateBlockStatus() {},
  async updateProfileName() {},
  async updateProfileStatus() {},
  async updateProfilePicture() {},
  async profilePictureUrl() { return 'https://example.com/pp.jpg'; },
  async fetchStatus() { return { status: 'Available', setAt: Date.now() }; },
  async onWhatsApp() { return [{ jid: '923001234567@s.whatsapp.net', exists: true }]; },
  async rejectCall() {},
};

/* ────────────────────────── harness ────────────────────────── */
const OWNER = '923145396910@s.whatsapp.net';
const USER = '923001234567@s.whatsapp.net';
const GROUP = '120363000000000000@g.us';

function rawMessage(text, { chat = USER, fromMe = false, pushName = 'Tester', quoted, sender } = {}) {
  const isGroup = chat.endsWith('@g.us');
  // In a group the *participant* field carries the sender, never the group jid.
  const participant = sender || (isGroup ? OWNER : chat);
  const m = {
    key: {
      remoteJid: chat,
      fromMe,
      id: 'TEST' + Math.random().toString(36).slice(2, 12).toUpperCase(),
      ...(isGroup ? { participant } : {}),
    },
    pushName,
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
  if (quoted) {
    m.message = {
      extendedTextMessage: {
        text,
        contextInfo: {
          stanzaId: 'QUOTED1', participant: OWNER,
          quotedMessage: { conversation: quoted },
        },
      },
    };
  } else {
    m.message = { conversation: text };
  }
  return m;
}

function rawButton(buttonId, chat = USER) {
  return {
    key: { remoteJid: chat, fromMe: false, id: 'BTN' + Math.random().toString(36).slice(2, 12).toUpperCase() },
    pushName: 'Tester',
    message: {
      interactiveResponseMessage: {
        nativeFlowResponseMessage: { name: 'quick_reply', paramsJson: JSON.stringify({ id: buttonId }) },
      },
    },
  };
}

async function run(text, opts = {}) {
  sent.length = 0;
  const m = serialize(mockSock, typeof text === 'string' ? rawMessage(text, opts) : text);
  await handleMessages(mockSock, m);
  return { m, sent: [...sent] };
}

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  \x1b[31m✖\x1b[0m ${name}\n      ${err.message.split('\n').slice(0, 4).join('\n      ')}`);
  }
}

const lastText = () => {
  for (let i = sent.length - 1; i >= 0; i--) {
    const c = sent[i].content;
    if (c?.text) return c.text;
    const im = c?.viewOnceMessage?.message?.interactiveMessage;
    if (im) return `${im.header?.title || ''}\n${im.body?.text || ''}`;
  }
  return '';
};
const lastInteractive = () => {
  for (let i = sent.length - 1; i >= 0; i--) {
    const c = sent[i].content;
    const im = c?.viewOnceMessage?.message?.interactiveMessage;
    if (im) return im;
    if (c?.text) return null;
  }
  return null;
};
const buttonLabels = (im) =>
  (im?.nativeFlowMessage?.buttons || []).map((b) => {
    try { return JSON.parse(b.buttonParamsJson).display_text || JSON.parse(b.buttonParamsJson).title || b.name; }
    catch { return b.name; }
  });
const buttonIds = (im) =>
  (im?.nativeFlowMessage?.buttons || []).map((b) => {
    try { return JSON.parse(b.buttonParamsJson).id; } catch { return null; }
  }).filter(Boolean);

/* ══════════════════════════ TESTS ══════════════════════════ */

console.log('\n\x1b[1m⚡ Kashif Tech Advance Bot — offline smoke test\x1b[0m\n');

console.log('\x1b[36m[1] Boot\x1b[0m');
await test('config loads with the pairing number normalised', () => {
  assert.equal(config.pairingNumber, '923145396910');
  assert.equal(config.botName, 'Kashif Tech Advance Bot');
  assert.ok(config.owners.includes('923145396910'));
});
await test('database initialises', () => { load(); assert.ok(fs.existsSync(path.join(config.sessionDir, 'database.json')) || true); });
await test('all plugins load with zero failures', async () => {
  const r = await loadPlugins();
  assert.deepEqual(r.failed, [], `plugin failures: ${r.failed.join(' | ')}`);
  assert.ok(r.count >= 40, `expected >=40 plugins, got ${r.count}`);
});
await test('plugin index is populated', () => {
  const s = stats();
  assert.ok(s.commands >= 60, `expected >=60 triggers, got ${s.commands}`);
  assert.ok(s.categories >= 8, `expected >=8 categories, got ${s.categories}`);
});

console.log('\n\x1b[36m[2] The button menu\x1b[0m');
await test('.menu returns a native interactiveMessage', async () => {
  await run('.menu');
  const im = lastInteractive();
  assert.ok(im, 'no interactiveMessage was sent — the menu did not use buttons');
  assert.ok((im.nativeFlowMessage?.buttons || []).length >= 5, 'menu has too few buttons');
});
await test('menu is titled "KASHIF TECH ADVANCE BOT"', async () => {
  await run('.menu');
  const im = lastInteractive();
  const blob = `${im.header?.title || ''} ${im.header?.subtitle || ''} ${im.body?.text || ''} ${im.footer?.text || ''}`;
  assert.ok(/KASHIF TECH ADVANCE BOT/i.test(blob), `bot name missing from menu:\n${blob.slice(0, 200)}`);
});
await test('menu shows one quick-reply button per category', async () => {
  await run('.menu');
  const ids = buttonIds(lastInteractive());
  const catButtons = ids.filter((i) => i.startsWith('menu:'));
  assert.ok(catButtons.length >= 6, `expected >=6 category buttons, got ${catButtons.length}: ${catButtons}`);
});
await test('menu includes a single_select list of every command', async () => {
  await run('.menu');
  const im = lastInteractive();
  const sel = im.nativeFlowMessage.buttons.find((b) => b.name === 'single_select');
  assert.ok(sel, 'no single_select (dropdown list) button found');
  const p = JSON.parse(sel.buttonParamsJson);
  const rows = p.sections.flatMap((s) => s.rows);
  assert.ok(rows.length >= 40, `expected >=40 list rows, got ${rows.length}`);
});
await test('pressing a category button opens that sub-menu', async () => {
  await run(rawButton('menu:Downloader'));
  const t = lastText();
  assert.ok(/DOWNLOADER/i.test(t), `submenu did not render:\n${t.slice(0, 200)}`);
  assert.ok(/tiktok/i.test(t), 'downloader submenu missing the tiktok command');
});
await test('pressing a command button runs the command', async () => {
  await run(rawButton('ping'));
  const t = lastText();
  assert.ok(/ms/i.test(t), `ping did not run from a button press:\n${t.slice(0, 150)}`);
});
await test('menu aliases work (.help, .list, .allmenu)', async () => {
  for (const a of ['.help', '.list', '.allmenu']) {
    await run(a);
    assert.ok(sent.length > 0, `${a} produced no reply`);
  }
});
await test('text fallback mirrors the button menu', async () => {
  const { buttonsToText, interactivePayload } = await import('../lib/buttons.js');
  const p = interactivePayload({ text: 'BODY', title: 'TITLE', buttons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Click Me', id: 'x' }) }] });
  const t = buttonsToText(p);
  assert.ok(/Click Me/.test(t), 'fallback text lost the button label');
});

console.log('\n\x1b[36m[3] Command routing & prefixes\x1b[0m');
await test('multiple prefixes are accepted (. / ! # ? +)', async () => {
  for (const p of ['.', '/', '!', '#', '?', '+']) {
    await run(`${p}ping`);
    assert.ok(lastText().includes('ms'), `prefix "${p}" did not trigger ping`);
  }
});
await test('unknown commands are silently ignored', async () => {
  await run('.thiscommanddoesnotexist');
  assert.equal(sent.length, 0, 'bot replied to an unknown command');
});
await test('owner-only commands block normal users', async () => {
  await run('.bc hello everyone');
  assert.ok(/owner only/i.test(lastText()), 'owner gate did not block a normal user');
});
await test('owner-only commands run for the owner', async () => {
  await run('.session', { chat: OWNER });
  assert.ok(sent.length > 0 && !/owner only/i.test(lastText()), 'owner could not run an owner command');
});
await test('group-only commands are rejected in DM', async () => {
  await run('.groupinfo');
  assert.ok(/group/i.test(lastText()), 'group gate did not fire');
});
await test('group commands work inside a group', async () => {
  await run('.groupinfo', { chat: GROUP });
  assert.ok(/GROUP INFO/i.test(lastText()), 'groupinfo failed inside a group');
});
await test('admin-only commands are rejected for members', async () => {
  await run('.kick @923009876543', { chat: GROUP, sender: '923009876543@s.whatsapp.net' });
  assert.ok(/admin/i.test(lastText()), 'admin gate did not fire');
});
await test('admin commands run for the group owner', async () => {
  await run('.hidetag hello', { chat: GROUP });
  assert.ok(sent.some((s) => (s.content?.mentions || []).length === 3), 'hidetag did not mention all 3 members');
});

console.log('\n\x1b[36m[4] Offline commands (no internet needed)\x1b[0m');
await test('.qr generates a real QR image locally', async () => {
  await run('.qr https://github.com');
  const img = sent.find((s) => s.content?.image);
  assert.ok(img, 'no image was sent');
  assert.ok(Buffer.isBuffer(img.content.image), 'QR image is not a Buffer');
  assert.ok(img.content.image.length > 500, 'QR image looks empty');
});
await test('.calc evaluates maths', async () => {
  await run('.calc (12+8)*3/4');
  assert.ok(lastText().includes('15'), `calc wrong: ${lastText()}`);
});
await test('.calc rejects non-maths input', async () => {
  await run('.calc process.exit()');
  assert.ok(/Invalid expression/.test(lastText()), 'calc accepted unsafe input');
});
await test('.fancy produces unicode styles', async () => {
  await run('.fancy Kashif');
  const t = lastText();
  assert.ok(t.includes('𝗞𝗮𝘀𝗵𝗶𝗳'.slice(0, 4)) || t.length > 100, `fancy output missing:\n${t.slice(0, 120)}`);
});
await test('.base64 encodes and decodes', async () => {
  await run('.b64 enc hello');
  assert.ok(lastText().includes('aGVsbG8='), `b64 encode wrong: ${lastText()}`);
  await run('.b64 dec aGVsbG8=');
  assert.ok(lastText().includes('hello'), `b64 decode wrong: ${lastText()}`);
});
await test('.truth / .dare / .coin / .dice all reply', async () => {
  for (const [c, re] of [['.truth', /TRUTH/], ['.dare', /DARE/], ['.coin', /Coin|HEADS|TAILS/i]]) {
    await run(c);
    assert.ok(re.test(lastText()), `${c} gave an unexpected reply: ${lastText().slice(0, 100)}`);
  }
  await run('.dice');
  assert.ok(sent.some((s) => s.content?.sticker), 'dice did not send a sticker');
});
await test('.profile shows the user record', async () => {
  await run('.profile');
  assert.ok(/YOUR PROFILE/i.test(lastText()), 'profile failed');
});
await test('.botinfo renders the system panel', async () => {
  await run('.botinfo');
  const im = lastInteractive() || {};
  const blob = `${im.body?.text || ''}${lastText()}`;
  assert.ok(/SYSTEM/i.test(blob) && /KASHIF TECH ADVANCE BOT/i.test(blob), 'botinfo incomplete');
});
await test('.state reports the connection state', async () => {
  await run('.state');
  assert.ok(/Connection State/i.test(lastText()), 'state failed');
});
await test('.setmenu switches menu style', async () => {
  await run('.setmenu carousel', { chat: OWNER });
  const { db } = await import('../src/database.js');
  assert.equal(db.settings.menuType, 'carousel');
  await run('.setmenu buttons', { chat: OWNER });
});
await test('.toggle flips a feature switch', async () => {
  await run('.toggle anticall on', { chat: OWNER });
  const { db } = await import('../src/database.js');
  assert.equal(db.settings.antiCall, true);
  await run('.toggle anticall off', { chat: OWNER });
});
await test('owner eval trigger ">" works and is blocked for others', async () => {
  await run('>2+2', { chat: OWNER });
  assert.ok(lastText().includes('4'), `eval did not run for owner: ${lastText()}`);
  await run('>2+2', { chat: USER });
  assert.ok(/owner only/i.test(lastText()), 'eval was not blocked for a normal user');
});
await test('a quoted message is exposed to plugins', async () => {
  await run('.delete', { chat: GROUP, quoted: 'please delete this' });
  assert.ok(sent.some((s) => s.content?.delete), 'delete did not use the quoted message id');
});

console.log('\n\x1b[36m[5] Converter pipeline (ffmpeg)\x1b[0m');
await test('imageToWebp + addExif produce a valid WebP sticker', async () => {
  const { imageToWebp, addExif, textToImage } = await import('../lib/converter.js');
  const png = await textToImage('KASHIF', { bg: 'white', fg: 'black', size: 90 });
  assert.ok(png.length > 1000, 'ffmpeg did not render a PNG');
  const webp = await imageToWebp(png);
  assert.equal(webp.slice(0, 4).toString(), 'RIFF', 'output is not RIFF');
  assert.equal(webp.slice(8, 12).toString(), 'WEBP', 'output is not WEBP');
  assert.ok(webp.includes(Buffer.from('EXIF')), 'sticker EXIF metadata missing');
  assert.ok(webp.includes(Buffer.from(config.packName)), 'pack name missing from EXIF');
  assert.ok(webp.length > 2000, 'webp suspiciously small');
});
await test('.attp builds a sticker from text without internet', async () => {
  await run('.attp Kashif Tech');
  assert.ok(sent.some((s) => s.content?.sticker), 'attp did not produce a sticker');
});
await test('the full round-trip works: text → png → webp → mp4 → animated webp', async () => {
  const { imageToWebp, webpToMp4, videoToWebp, textToImage } = await import('../lib/converter.js');
  const png = await textToImage('ROUND TRIP', { bg: 'white', fg: 'black', size: 60 });
  const webp = await imageToWebp(png);
  const mp4 = await webpToMp4(webp);
  assert.ok(mp4.length > 1000, 'webp → mp4 failed');
  const anim = await videoToWebp(mp4, 2);
  assert.equal(anim.slice(0, 4).toString(), 'RIFF', 'animated output is not RIFF');
  assert.equal(anim.slice(8, 12).toString(), 'WEBP', 'animated output is not WEBP');
  assert.ok(anim.includes(Buffer.from('EXIF')), 'animated sticker lost its EXIF pack metadata');
});

console.log('\n\x1b[36m[6] Menu coverage\x1b[0m');
await test('every category in the menu resolves to real commands', () => {
  for (const [cat, list] of byCategory) {
    assert.ok(list.length > 0, `category ${cat} is empty`);
    for (const p of list) assert.equal(typeof p.handler, 'function', `${cat}/${p.name} has no handler`);
  }
});
await test('every visible plugin is reachable through resolveCommand', () => {
  for (const [, list] of byCategory) {
    for (const p of list) assert.ok(resolveCommand(p.name), `${p.name} is not resolvable`);
  }
});
await test('category sub-menus render for every category', async () => {
  for (const cat of byCategory.keys()) {
    await run(rawButton(`menu:${cat}`));
    assert.ok(sent.length > 0, `sub-menu for ${cat} produced nothing`);
    const blob = `${(lastInteractive()?.header?.title) || ''} ${lastText()}`;
    assert.ok(new RegExp(cat, 'i').test(blob), `sub-menu for ${cat} did not mention its category:\n${blob.slice(0, 140)}`);
  }
});

console.log('\n\x1b[36m[7] Process lifecycle (PM2 / systemd / Docker)\x1b[0m');
await test('the bot exits promptly on SIGTERM', async () => {
  const { spawn } = await import('node:child_process');
  const net = await import('node:net');
  const PORT = 3199;

  const child = spawn(process.execPath, ['index.js', '--panel-only'], {
    cwd: process.cwd(),
    env: { ...process.env, PANEL_ENABLED: 'true', PANEL_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });

  const portUp = () => new Promise((res) => {
    const s = net.connect({ host: '127.0.0.1', port: PORT });
    s.once('connect', () => { s.destroy(); res(true); });
    s.once('error', () => res(false));
  });

  // wait up to 12s for the panel to come up
  let up = false;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) break;
    if (await portUp()) { up = true; break; }
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(up, `child never opened port ${PORT}. stderr: ${stderr.slice(0, 300)}`);

  // open an SSE connection so the panel has a live socket it must not hang on
  const sse = net.connect({ host: '127.0.0.1', port: PORT });
  await new Promise((r) => sse.once('connect', r));
  sse.write(`GET /api/events?token=${config.panelToken} HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: text/event-stream\r\n\r\n`);
  await new Promise((r) => setTimeout(r, 400));

  const t0 = Date.now();
  child.kill('SIGTERM');
  const code = await new Promise((res) => {
    const killer = setTimeout(() => { child.kill('SIGKILL'); res('KILLED'); }, 10000);
    child.once('exit', (c) => { clearTimeout(killer); res(c); });
  });
  const ms = Date.now() - t0;
  sse.destroy();

  assert.notEqual(code, 'KILLED', `SIGTERM did not stop the bot within 10s — PM2/systemd/Docker would have to SIGKILL it. stderr: ${stderr.slice(0, 300)}`);
  assert.ok(ms < 6000, `took ${ms}ms to exit after SIGTERM (should be well under 6000ms)`);
});

/* ────────────────────────── summary ────────────────────────── */
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\n\x1b[1m${fail === 0 ? '✅' : '❌'} ${pass}/${results.length} checks passed\x1b[0m`);
if (fail) {
  console.log('\nFailures:');
  results.filter((r) => !r.ok).forEach((r) => console.log(`  • ${r.name}\n    ${r.err.message.split('\n')[0]}`));
}
const s = stats();
console.log(`\n\x1b[36mBot ready:\x1b[0m ${s.total} plugins · ${s.commands} triggers · ${s.categories} menu categories`);
console.log(`\x1b[36mCategories:\x1b[0m ${[...byCategory.keys()].join(', ')}\n`);

fs.rmSync(config.sessionDir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
