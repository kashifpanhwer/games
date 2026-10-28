import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { config } from '../src/config.js';
import {
  extractMessageContent,
  downloadContentFromMessage,
  jidNormalizedUser,
  getContentType,
  normalizeMessageContent,
} from '@whiskeysockets/baileys';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const isUrl = (s) =>
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi.test(s);

export const getUrls = (text = '') => (String(text).match(/https?:\/\/[^\s)]+/g) || []);

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const clockString = (ms) => {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const p = [];
  if (d) p.push(`${d}d`);
  if (h) p.push(`${h}h`);
  if (m) p.push(`${m}m`);
  if (s || !p.length) p.push(`${s}s`);
  return p.join(' ');
};

export const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(decimals))} ${sizes[i]}`;
};

export const tmpFile = (ext = 'bin') => path.join(os.tmpdir(), `ktb_${crypto.randomBytes(6).toString('hex')}.${ext}`);

export async function fetchJson(url, options = {}) {
  const res = await axios.get(url, {
    timeout: 30000,
    responseType: 'json',
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124.0 Safari/537.36', ...options.headers },
    ...options,
  });
  return res.data;
}

export async function fetchBuffer(url, options = {}) {
  const res = await axios.get(url, {
    timeout: 60000,
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124.0 Safari/537.36', ...options.headers },
    ...options,
  });
  return Buffer.from(res.data);
}

export const jidEncode = (num, server = 's.whatsapp.net') =>
  `${String(num).replace(/[^\d]/g, '')}@${server}`;

export const toJid = (s = '') => {
  const t = String(s).trim();
  if (t.includes('@')) return t;
  if (/^\d+$/.test(t)) return jidEncode(t);
  if (isUrl(t)) {
    const m = t.match(/(\d+)-(\d+)@g\.us/);
    if (m) return m[0];
  }
  return t;
};

export const getGroupAdmins = (participants = []) =>
  participants
    .filter((p) => p.admin === 'admin' || p.admin === 'superadmin')
    .map((p) => p.id);

export const parseMentions = (text = '') => [...String(text).matchAll(/@(\d{5,})/g)].map((m) => jidEncode(m[1]));

export const generateProfilePicture = async () => null; // reserved for future use

/**
 * Turn a raw Baileys WAMessage into the ergonomic `m` object used by every plugin.
 */
export function serialize(sock, m, store) {
  if (!m) return m;
  if (m.key) {
    m.id = m.key.id;
    m.isBot = m.id.startsWith('BAE5') && m.id.length === 16;
    m.isBaileys =
      m.id?.length === 16 && m.id?.startsWith('3EB0') && m.id?.length !== 22 ? false : m.id?.startsWith('3EB0');
    m.chat = m.key.remoteJid;
    m.fromMe = m.key.fromMe;
    m.isGroup = m.chat.endsWith('@g.us');
    m.sender = m.fromMe
      ? sock.user?.id || sock.user?.jid || ''
      : m.isGroup
        ? m.key.participant || m.chat
        : m.chat;
    m.senderJid = m.sender;
  }

  // unwrap view-once / ephemeral containers
  if (m.message) {
    const types = [
      'viewOnceMessage',
      'viewOnceMessageV2',
      'viewOnceMessageV2Extension',
      'ephemeralMessage',
      'documentWithCaptionMessage',
    ];
    for (const t of types) {
      if (m.message[t]?.message) m.message = m.message[t].message;
    }
    if (m.message.protocolMessage?.type === 0) {
      // reaction / edit metadata
    }
    m.mtype = getContentType(m.message) || '';
    m.msg =
      m.mtype === 'viewOnceMessageV2'
        ? m.message.viewOnceMessageV2?.message
        : m.mtype === 'documentWithCaptionMessage'
          ? m.message.documentWithCaptionMessage?.message
          : normalizeMessageContent(m.message[m.mtype]) || m.message[m.mtype];
    m.messageContent = extractMessageContent(m.message) || {};
  } else {
    m.mtype = '';
    m.msg = null;
    m.messageContent = {};
  }

  const msg = m.msg || {};
  m.type = m.mtype;
  m.isMedia = !!msg.mimetype || !!msg.seconds;

  const quotedType =
    msg.contextInfo?.quotedMessage && getContentType(msg.contextInfo.quotedMessage);

  m.text = (
    (m.mtype === 'conversation' && m.message?.conversation) ||
    (m.mtype === 'extendedTextMessage' && msg.text) ||
    (m.mtype === 'imageMessage' && msg.caption) ||
    (m.mtype === 'videoMessage' && msg.caption) ||
    (m.mtype === 'documentMessage' && msg.caption) ||
    (m.mtype === 'listResponseMessage' && msg.singleSelectReply?.selectedRows?.[0]?.title) ||
    (m.mtype === 'buttonsResponseMessage' &&
      (msg.selectedDisplayText || msg.selectedButtonId || msg.selectedId)) ||
    (m.mtype === 'templateButtonReplyMessage' &&
      (msg.selectedDisplayText || msg.selectedId)) ||
    (m.mtype === 'interactiveResponseMessage' &&
      (() => {
        try {
          const p = JSON.parse(msg.nativeFlowResponseMessage?.paramsJson || '{}');
          return p.id || p.selectedId || msg.nativeFlowResponseMessage?.paramsJson || '';
        } catch {
          return msg.nativeFlowResponseMessage?.paramsJson || '';
        }
      })()) ||
    ''
  ).toString().trim();

  m.mentions = (msg.contextInfo?.mentionedJid || []).concat(parseMentions(m.text));
  m.pushName = m.pushName || msg.contextInfo?.participant || '';
  m.caption = msg.caption || '';
  m.mimetype = msg.mimetype || '';
  m.seconds = msg.seconds;
  m.fileName = msg.fileName || msg.title || '';
  m.fileLength = msg.fileLength;
  m.isViewOnce =
    m.message?.viewOnceMessage || m.message?.viewOnceMessageV2 || m.mtype === 'viewOnceMessageV2';

  // ---- quoted message ----
  m.quoted = null;
  if (quotedType && msg.contextInfo) {
    const qm = msg.contextInfo.quotedMessage;
    const qmsg = qm[quotedType] || {};
    m.quoted = {
      mtype: quotedType,
      msg: qmsg,
      sender: msg.contextInfo.participant,
      chat: m.chat,
      id: msg.contextInfo.stanzaId,
      fromMe: msg.contextInfo.participant === (sock.user?.id || '').replace(/:\d+/, ''),
      text:
        qmsg.text || qmsg.caption || qmsg.conversation || qmsg.selectedDisplayText || '',
      mentions: qmsg.contextInfo?.mentionedJid || [],
      mimetype: qmsg.mimetype || '',
      isMedia: !!qmsg.mimetype || !!qmsg.seconds,
      isViewOnce: quotedType === 'viewOnceMessage' || quotedType === 'viewOnceMessageV2',
      download: (saveToFile) => downloadMedia(sock, qm, saveToFile),
      delete: () =>
        sock.sendMessage(m.chat, {
          delete: {
            remoteJid: m.chat,
            fromMe: false,
            id: msg.contextInfo.stanzaId,
            participant: msg.contextInfo.participant,
          },
        }),
      reply: (text, opts = {}) =>
        sock.sendMessage(m.chat, { text, ...opts }, { quoted: { key: { remoteJid: m.chat, fromMe: false, id: msg.contextInfo.stanzaId, participant: msg.contextInfo.participant }, message: qm } }),
    };
    if (m.quoted.isViewOnce && qm[quotedType]?.message) {
      const inner = qm[quotedType].message;
      const innerType = getContentType(inner);
      m.quoted.mtype = innerType;
      m.quoted.msg = inner[innerType] || {};
      m.quoted.download = (saveToFile) => downloadMedia(sock, inner, saveToFile);
    }
  }

  // ---- helpers ----
  m.download = (saveToFile) => downloadMedia(sock, m.message, saveToFile);
  m.reply = (text, opts = {}) => sock.sendMessage(m.chat, { text, ...opts }, { quoted: opts.quoted === false ? undefined : m });
  m.react = (emoji) => sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
  m.copy = () => serialize(sock, { key: { ...m.key }, message: { ...m.message }, pushName: m.pushName });
  m.forward = (jid, force = false) =>
    sock.copyNForward ? sock.copyNForward(jid, m, force) : sock.sendMessage(jid, { forward: m });
  m.delete = () => sock.sendMessage(m.chat, { delete: m.key });
  m.isOwner = config.owners.includes(jidNormalizedUser(m.sender).split('@')[0]) || m.fromMe;
  m.isAdmin = false;
  m.isGroupAdmin = false;
  m.isBotAdmin = false;

  return m;
}

/** Download any media from a raw message object. */
export async function downloadMedia(sock, message, saveToFile = false) {
  if (!message) throw new Error('No message to download');
  let mtype = getContentType(message);
  let msg = message[mtype];
  if (msg?.message) {
    mtype = getContentType(msg);
    msg = msg[mtype];
  }
  const stream = await downloadContentFromMessage(msg, mtype.replace('Message', ''));
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (saveToFile) {
    const { fileTypeFromBuffer } = await import('file-type');
    const ft = await fileTypeFromBuffer(buffer);
    const file = saveToFile === true ? tmpFile(ft?.ext || 'bin') : saveToFile;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
    return file;
  }
  return buffer;
}

export const runtime = () => clockString(process.uptime() * 1000);

export const banner = () => {
  const line = '═'.repeat(52);
  return `
╔${line}╗
║   ⚡  ${config.botName.toUpperCase()}  v${config.versionLabel}
║   Owner : ${config.ownerName}  (+${config.owners[0] || '-'})
║   Node  : ${process.version}   Platform: ${os.platform()}/${os.arch()}
╚${line}╝`.trim();
};
