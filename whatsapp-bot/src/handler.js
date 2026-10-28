import { config } from './config.js';
import { pushLog, connState } from './state.js';
import { db, getUser, getGroup, isBanned, hasLimit, useLimit, bumpCommand, recordCommand, setSetting } from './database.js';
import { resolveCommand, checkCooldown, plugins, byCategory } from './plugins.js';
import { extractButtonId } from '../lib/buttons.js';
import { getUrls, escapeRegex, parseMentions, getGroupAdmins, sleep } from '../lib/functions.js';
import {
  isJidGroup,
  isJidBroadcast,
  isJidStatusBroadcast,
  jidNormalizedUser,
  downloadContentFromMessage,
} from '@whiskeysockets/baileys';

/**
 * ─────────────────────────────────────────────────────────────
 *  MESSAGE HANDLER — one entry point for every incoming event
 * ─────────────────────────────────────────────────────────────
 */

const NO_PREFIX_RE = /^(\.|!|#|\/|\$|\?|\+)/;

export async function handleMessages(sock, m) {
  if (!m) return;
  connState.messages += 1;

  const body = (m.text || '').toString();
  if (!body && !m.isMedia && m.mtype !== 'protocolMessage') return;

  // ignore status broadcasts + newsletters
  if (isJidBroadcast(m.chat) || isJidStatusBroadcast(m.chat)) return;

  // ignore messages sent by the bot itself / other bots
  if (m.fromMe && m.isBot) return;
  if (m.isBot && !m.fromMe) return;

  // ---- enrich with group metadata (cached per message) ----
  let meta = null;
  if (m.isGroup) {
    try {
      meta = await sock.groupMetadata(m.chat);
    } catch { /* private/guest group */ }
    if (meta) {
      const admins = getGroupAdmins(meta.participants || []);
      m.groupName = meta.subject || '';
      m.participants = meta.participants || [];
      m.isAdmin = admins.includes(jidNormalizedUser(m.sender));
      m.isGroupAdmin = m.isAdmin;
      const meJid = jidNormalizedUser(sock.user?.id || '');
      m.isBotAdmin = admins.includes(meJid);
    }
  }

  const isPublic = db.settings.publicMode;
  m.user = getUser(m.sender, m.pushName);
  if (banned(m.sender)) {
    if (body) await sock.sendMessage(m.chat, { text: `⛔ You are banned from using *${config.botName}*.` }, { quoted: m });
    return;
  }

  // ---- presence / typing indicator ----
  if (db.settings.autoTyping && body) {
    try { await sock.sendPresenceUpdate('composing', m.chat); } catch { /* ignore */ }
  }
  if (db.settings.autoRead) {
    try { await sock.readMessages([m.key]); } catch { /* ignore */ }
  }

  // ---- anti features (group) ----
  if (m.isGroup) {
    const g = getGroup(m.chat);
    if (await runAntilink(sock, m, g)) return;
  }

  // ---- view-once bypass ----
  if (db.settings.antiViewOnce && m.isViewOnce && m.mtype !== 'interactiveResponseMessage') {
    try {
      const { antiViewOnce } = await import('../lib/anti-features.js');
      await antiViewOnce(sock, m);
      return;
    } catch (err) {
      pushLog('warn', `antiViewOnce failed: ${err.message}`);
    }
  }

  // ---- command parsing ----
  const { command, args, text, usedPrefix, noPrefix, isCmd } = parseCommand(body);

  // button / list responses carry the command id directly
  let buttonId = null;
  if (['interactiveResponseMessage', 'buttonsResponseMessage', 'listResponseMessage', 'templateButtonReplyMessage'].includes(m.mtype)) {
    buttonId = extractButtonId(m);
  }

  let plugin = null;
  let trigger = '';
  let buttonArg = '';
  if (buttonId) {
    const raw = String(buttonId).trim();
    plugin = resolveCommand(raw) || resolveCommand(raw.replace(NO_PREFIX_RE, ''));
    trigger = raw;
    // Dynamic ids:  "menu:downloader"  |  "dl:tiktok"  |  "owner:1"
    if (!plugin && raw.includes(':')) {
      const [head, ...tail] = raw.split(':');
      const dyn = resolveCommand(head) || resolveCommand(head.replace(NO_PREFIX_RE, ''));
      if (dyn) {
        plugin = dyn;
        trigger = head;
        buttonArg = tail.join(':');
      }
    }
  }
  if (!plugin && command) {
    plugin = resolveCommand(command);
    trigger = command;
  }
  // plain "menu" typed without a prefix still opens the menu
  if (!plugin && !noPrefix && body.toLowerCase() === 'menu') {
    plugin = resolveCommand('menu');
    trigger = 'menu';
  }

  if (!plugin) return;

  connState.commands += 1;
  recordCommand(trigger, m.sender);
  bumpCommand(m.sender);

  cacheMessage(m);

  const ctx = {
    m,
    sock,
    conn: sock,
    client: sock,
    args,
    text,
    buttonArg,
    quoted: m.quoted,
    command: trigger,
    usedPrefix,
    noPrefix,
    isCmd: true,
    isGroup: m.isGroup,
    groupName: m.groupName,
    isAdmin: m.isAdmin,
    isBotAdmin: m.isBotAdmin,
    isOwner: m.isOwner,
    participants: m.participants || [],
    groupMetadata: meta,
    config,
    plugins,
    byCategory,
    db,
    settings: db.settings,
    botName: config.botName,
    botAuthor: config.botAuthor,
    prefix: config.prefixLabel,
    version: config.versionLabel,
    // database helpers
    getUser, getGroup, setSetting, isBanned, hasLimit, useLimit,
    // misc
    isPublic,
    pushLog,
    sleep,
  };

  // ---- permission gate ----
  const gate = await gatekeep(ctx, plugin);
  if (!gate.ok) {
    if (gate.reply) await safeSend(sock, m.chat, gate.reply, m);
    return;
  }

  // ---- cooldown + limit ----
  const cool = checkCooldown(plugin, m.sender);
  if (!cool.ok) {
    return safeSend(sock, m.chat, `⏳ Slow down! Try *${plugin.name}* again in ${cool.wait}s.`, m);
  }
  if (plugin.limit > 0) {
    if (!hasLimit(m.sender)) {
      return safeSend(sock, m.chat, `❌ Your daily limit is exhausted (${config.limitPerDay}/day). It resets at midnight.`, m);
    }
    useLimit(m.sender, plugin.limit);
  }

  // ---- execute ----
  try {
    if (plugin.media && plugin.media !== 'quotedMedia' && !matchesMedia(plugin.media, m)) {
      return safeSend(sock, m.chat, `📎 Reply/caption a *${plugin.media}* with \`${usedPrefix}${trigger}${plugin.use ? ' ' + plugin.use : ''}\``, m);
    }
    if (plugin.media === 'quotedMedia' && !m.quoted?.isMedia && !m.isMedia) {
      return safeSend(sock, m.chat, `📎 Reply to a media message with \`${usedPrefix}${trigger}${plugin.use ? ' ' + plugin.use : ''}\``, m);
    }
    if (plugin.quoted && !m.quoted) {
      return safeSend(sock, m.chat, `↩️ Reply to a message with \`${usedPrefix}${trigger}${plugin.use ? ' ' + plugin.use : ''}\``, m);
    }

    pushLog('info', `cmd ${trigger} ← ${m.sender.split('@')[0]}${m.isGroup ? ' @' + (m.groupName || 'group') : ''}`);
    await m.react('🕐').catch(() => {});
    const result = await plugin.handler(ctx);
    await m.react('✅').catch(() => {});
    return result;
  } catch (err) {
    pushLog('error', `${trigger} failed: ${err.message}`);
    await m.react('❌').catch(() => {});
    return safeSend(
      sock,
      m.chat,
      `⚠️ Command *${trigger}* failed:\n\`${String(err.message || err).slice(0, 500)}\``,
      m,
    );
  }
}

/* ─────────────────────────── helpers ─────────────────────────── */

function parseCommand(body) {
  const raw = (body || '').trim();

  // Owner special triggers: ">code" (eval) and "$cmd" (shell) come first,
  // because they are single-character and must not be eaten by the prefix list.
  for (const [ch, cmd] of Object.entries(config.specialPrefixes || {})) {
    if (raw.startsWith(ch) && raw.length > ch.length) {
      const rest = raw.slice(ch.length);
      const parts = rest.split(/\s+/).filter(Boolean);
      return { command: cmd, args: parts, text: parts.join(' '), usedPrefix: ch, noPrefix: false, isCmd: true };
    }
  }

  let usedPrefix = '';
  let noPrefix = true;
  let rest = raw;

  const prefixes = config.multiPrefix ? ['.', '/', '!', '#', '?', '+'] : [config.prefix];
  for (const p of prefixes) {
    if (raw.startsWith(p)) {
      usedPrefix = p;
      noPrefix = false;
      rest = raw.slice(p.length);
      break;
    }
  }

  const parts = rest.split(/\s+/).filter(Boolean);
  const command = noPrefix ? '' : (parts.shift() || '').toLowerCase();
  const args = parts;
  const text = args.join(' ');

  return { command, args, text, usedPrefix: usedPrefix || config.prefix, noPrefix, isCmd: !noPrefix && !!command };
}

const banned = (jid) => {
  try { return isBanned(jid); } catch { return false; }
};

function matchesMedia(want, m) {
  switch (want) {
    case 'image':  return m.mtype === 'imageMessage';
    case 'video':  return m.mtype === 'videoMessage';
    case 'audio':  return m.mtype === 'audioMessage';
    case 'sticker':return m.mtype === 'stickerMessage';
    case 'document': return m.mtype === 'documentMessage';
    case 'contact':return m.mtype === 'contactMessage';
    case 'any':    return !!m.isMedia;
    default:       return true;
  }
}

async function gatekeep(ctx, p) {
  const { m } = ctx;

  if (!ctx.isPublic && !m.isOwner) {
    return { ok: false, reply: `🔒 *${config.botName}* is in **private mode**. Only the owner can use commands.` };
  }
  if (p.owner && !m.isOwner) {
    return { ok: false, reply: '🔒 This command is for the **owner only**.' };
  }
  if (p.group && !m.isGroup) {
    return { ok: false, reply: '👥 This command only works inside a **group**.' };
  }
  if (p.private && m.isGroup) {
    return { ok: false, reply: '🔏 This command only works in **private chat**.' };
  }
  if (p.admin && !m.isAdmin) {
    return { ok: false, reply: '🛡️ Only a **group admin** can use this command.' };
  }
  if (p.botAdmin && !m.isBotAdmin) {
    return { ok: false, reply: '⬆️ Promote the bot to **admin** first.' };
  }
  if (p.nsfw && !ctx.settings.nsfw) {
    return { ok: false, reply: '🔞 NSFW is disabled. Owner can enable it with `.setnsfw on`.' };
  }
  return { ok: true };
}

async function safeSend(sock, jid, text, quoted) {
  try { await sock.sendMessage(jid, { text }, { quoted }); } catch { /* ignore */ }
}

async function runAntilink(sock, m, g) {
  if (!g?.antilink || !m.isBotAdmin || !m.text) return false;
  const urls = getUrls(m.text).filter((u) => /chat\.whatsapp\.com|wa\.me|bit\.ly|t\.me/i.test(u));
  if (!urls.length) return false;
  const { deleteLinkMessage } = await import('../lib/anti-features.js');
  await deleteLinkMessage(sock, m, g);
  return true;
}

/* ─────────────────────── messages.update (anti-delete) ─────────────────────── */

const messageCache = new Map(); // key.id -> { m, chat }
const CACHE_LIMIT = 300;

export function cacheMessage(m) {
  if (!m?.id) return;
  messageCache.set(m.id, { m, at: Date.now() });
  if (messageCache.size > CACHE_LIMIT) {
    const oldest = [...messageCache.keys()].sort((a, b) => messageCache.get(a).at - messageCache.get(b).at)[0];
    messageCache.delete(oldest);
  }
}

export async function handleMessageUpdate(sock, updates) {
  if (!db.settings.antiDelete) return;
  for (const u of updates || []) {
    const key = u.key || {};
    if (!key.id) continue;
    const isDelete = u.update?.message?.protocolMessage?.type === 0 ||
      (u.update && Object.keys(u.update).length === 0);
    if (!isDelete) continue;
    const cached = messageCache.get(key.id);
    if (!cached) continue;
    try {
      const { restoreDeleted } = await import('../lib/anti-features.js');
      await restoreDeleted(sock, cached.m);
    } catch (err) {
      pushLog('warn', `anti-delete failed: ${err.message}`);
    }
  }
}

export default { handleMessages, handleMessageUpdate, parseCommand };
