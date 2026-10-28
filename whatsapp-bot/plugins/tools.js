import QRCode from 'qrcode';
import { config } from '../src/config.js';
import { uploadBuffer } from '../lib/uploader.js';
import { downloadMedia, formatBytes, getUrls } from '../lib/functions.js';
import { toAudio, webpToMp4, imageToWebp } from '../lib/converter.js';
import { quickReply, interactivePayload, sendInteractive } from '../lib/buttons.js';

const tools = { category: 'Tools' };

export default [
  /* ══════════════ QR (fully offline) ══════════════ */
  {
    ...tools, name: 'qr', aliases: ['qrcode', 'makeqr'],
    desc: 'Turn any text/link into a QR code image', use: '<text>',
    handler: async ({ m, sock, text }) => {
      if (!text) return m.reply(`ℹ️ Usage: \`${config.prefix}qr https://example.com\``);
      const buf = await QRCode.toBuffer(text, { width: 720, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
      return sock.sendMessage(m.chat, { image: buf, caption: `📱 QR for:\n\`${text.slice(0, 200)}\`\n\n⚡ ${config.botName}` }, { quoted: m });
    },
  },

  /* ══════════════ Upload media → link ══════════════ */
  {
    ...tools, name: 'tourl', aliases: ['upload', 'link', 'tolink'],
    desc: 'Upload media and get a direct link', media: 'quotedMedia', limit: 1,
    handler: async ({ m, sock }) => {
      const src = m.quoted?.isMedia ? m.quoted : m;
      const buffer = await src.download();
      const ext = ({ imageMessage: 'jpg', videoMessage: 'mp4', audioMessage: 'mp3', stickerMessage: 'webp', documentMessage: 'bin' })[src.mtype] || 'jpg';
      const r = await uploadBuffer(buffer, ext);
      const payload = interactivePayload({
        text: `🔗 *Uploaded*\n\n📎 Size     : ${formatBytes(buffer.length)}\n🏢 Host     : ${r.provider}\n⏳ Expires  : ${r.ttl}\n\n\`${r.url}\``,
        title: 'Media Link',
        buttons: [
          { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Link', id: r.url, copy_code: r.url }) },
          { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🌐 Open', url: r.url }) },
        ],
      });
      return sendInteractive(sock, m.chat, payload, `🔗 ${r.url}\n(${r.provider} • ${r.ttl} • ${formatBytes(buffer.length)})`, { quoted: m });
    },
  },

  /* ══════════════ Screenshot ══════════════ */
  {
    ...tools, name: 'ss', aliases: ['screenshot', 'webshot', 'ssweb'],
    desc: 'Take a screenshot of any website', use: '<url>', limit: 1, cooldown: 6,
    handler: async ({ m, sock, args, text }) => {
      const url = getUrls(text)[0] || args[0];
      if (!url) return m.reply(`ℹ️ Usage: \`${config.prefix}ss https://github.com\``);
      const full = /^(https?:\/\/)/.test(url) ? url : `https://${url}`;
      await m.reply(`📸 Capturing ${full}…`);
      return sock.sendMessage(m.chat, {
        image: { url: `https://image.thum.io/get/width/1280/crop/900/noanimate/${full}` },
        caption: `📸 Screenshot of ${full}\n\n⚡ ${config.botName}`,
      }, { quoted: m });
    },
  },

  /* ══════════════ Text to speech ══════════════ */
  {
    ...tools, name: 'tts', aliases: ['say', 'voice', 'speak'],
    desc: 'Convert text to a voice note', use: '[lang] <text>  (en/ur/hi/ar)',
    handler: async ({ m, sock, args, text }) => {
      let lang = 'en';
      let body = text;
      if (/^[a-z]{2}$/i.test(args[0] || '')) { lang = args[0].toLowerCase(); body = args.slice(1).join(' '); }
      if (!body) return m.reply(`ℹ️ Usage: \`${config.prefix}tts ur آپ کیسے ہیں؟\`\nSupported: en, ur, hi, ar, id, tr, es, fr`);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(body.slice(0, 180))}&tl=${lang}&client=tw-ob`;
      return sock.sendMessage(m.chat, { audio: { url }, mimetype: 'audio/mpeg', ptt: true }, { quoted: m });
    },
  },

  /* ══════════════ Calculator ══════════════ */
  {
    ...tools, name: 'calc', aliases: ['calculator', 'math'],
    desc: 'Evaluate a maths expression', use: '(12+8)*3/4',
    handler: async ({ m, text }) => {
      const expr = (text || '').replace(/[^-()\d/*+.\s^%]/g, '');
      if (!expr.trim()) return m.reply(`ℹ️ Usage: \`${config.prefix}calc (12+8)*3/4\``);
      try {
        // eslint-disable-next-line no-new-func
        const val = Function(`"use strict";return (${expr.replace(/\^/g, '**')})`)();
        if (typeof val !== 'number' || !Number.isFinite(val)) throw new Error('not a number');
        return m.reply(`🧮 \`${expr.trim()}\` = *${val}*`);
      } catch { return m.reply('❌ Invalid expression.'); }
    },
  },

  /* ══════════════ Short link ══════════════ */
  {
    ...tools, name: 'shortlink', aliases: ['short', 'tinyurl'],
    desc: 'Shorten a URL', use: '<url>',
    handler: async ({ m, sock, text }) => {
      const url = getUrls(text)[0];
      if (!url) return m.reply(`ℹ️ Usage: \`${config.prefix}shortlink https://…\``);
      const { shortLink } = await import('../lib/scraper.js');
      const short = await shortLink(url);
      const payload = interactivePayload({
        text: `🔗 *Shortened*\n\n${short}`,
        title: 'Short Link',
        buttons: [
          { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy', id: short, copy_code: short }) },
          { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🌐 Open', url: short }) },
        ],
      });
      return sendInteractive(sock, m.chat, payload, `🔗 ${short}`, { quoted: m });
    },
  },

  /* ══════════════ Fancy text ══════════════ */
  {
    ...tools, name: 'fancy', aliases: ['styletext', 'fancytext', 'font'],
    desc: 'Convert text into fancy unicode styles', use: '<text>',
    handler: async ({ m, text }) => {
      if (!text) return m.reply(`ℹ️ Usage: \`${config.prefix}fancy Kashif Tech\``);
      const styles = fancyStyles(text.slice(0, 60));
      return m.reply(`✨ *Fancy Text* — "${text.slice(0, 40)}"\n\n${styles.map((s, i) => `*${i + 1}.* ${s}`).join('\n')}`);
    },
  },

  /* ══════════════ Base64 ══════════════ */
  {
    ...tools, name: 'base64', aliases: ['b64'],
    desc: 'Encode or decode Base64', use: 'enc|dec <text>',
    handler: async ({ m, args, text }) => {
      const mode = (args[0] || '').toLowerCase();
      const body = args.slice(1).join(' ');
      if (!body || !['enc', 'dec', 'encode', 'decode'].includes(mode)) {
        return m.reply(`ℹ️ Usage:\n\`${config.prefix}b64 enc hello\`\n\`${config.prefix}b64 dec aGVsbG8=\``);
      }
      try {
        const out = mode.startsWith('enc') ? Buffer.from(body, 'utf8').toString('base64') : Buffer.from(body, 'base64').toString('utf8');
        return m.reply(`🔐 ${mode.startsWith('enc') ? 'Encoded' : 'Decoded'}:\n\`\`\`\n${out.slice(0, 3500)}\n\`\`\``);
      } catch { return m.reply('❌ Could not process that input.'); }
    },
  },

  /* ══════════════ Read more ══════════════ */
  {
    ...tools, name: 'readmore', aliases: ['rm'],
    desc: 'Hide text behind WhatsApp’s “read more”', use: 'before|after',
    handler: async ({ m, sock, text }) => {
      const [a = '', b = ''] = text.split('|');
      return sock.sendMessage(m.chat, { text: `${a}\n${' '.repeat(4000)}\n${b}` }, { quoted: m });
    },
  },

  /* ══════════════ Profile lookup ══════════════ */
  {
    ...tools, name: 'getpp', aliases: ['pp', 'profilepic'],
    desc: 'Fetch someone’s profile picture', use: '@user',
    handler: async ({ m, sock, args }) => {
      const jid = m.mentions[0] || m.quoted?.sender || (args[0] ? `${String(args[0]).replace(/\D/g, '')}@s.whatsapp.net` : m.sender);
      let url;
      try { url = await sock.profilePictureUrl(jid, 'image'); }
      catch { return m.reply('❌ No profile picture set.'); }
      return sock.sendMessage(m.chat, { image: { url }, caption: `🖼️ Profile picture of @${jid.split('@')[0]}`, mentions: [jid] }, { quoted: m });
    },
  },
  {
    ...tools, name: 'getbio', aliases: ['bio', 'statuswa'],
    desc: 'Fetch someone’s WhatsApp about/status', use: '@user',
    handler: async ({ m, args, sock }) => {
      const jid = m.mentions[0] || m.quoted?.sender || (args[0] ? `${String(args[0]).replace(/\D/g, '')}@s.whatsapp.net` : m.sender);
      try {
        const st = await sock.fetchStatus(jid);
        return m.reply(`📝 @${jid.split('@')[0]}:\n\n${st?.status || '(no status)'}`, { mentions: [jid] });
      } catch { return m.reply('❌ Could not read the status (privacy restricted).'); }
    },
  },
  {
    ...tools, name: 'save', aliases: ['send'], owner: true,
    desc: 'Send the replied media to any number', use: '<number>',
    handler: async ({ m, sock, args }) => {
      const num = String(args[0] || '').replace(/\D/g, '');
      if (!num) return m.reply('ℹ️ Usage: reply to media, then `.save 923xxxxxxxxx`');
      const jid = `${num}@s.whatsapp.net`;
      const src = m.quoted || m;
      if (!src.isMedia) return m.reply('ℹ️ Reply to a media message.');
      const buf = await src.download();
      const t = (src.mtype || 'imageMessage').replace('Message', '');
      return sock.sendMessage(jid, { [t]: buf, caption: `📤 Forwarded by ${config.ownerName}` }, { quoted: m });
    },
  },
  {
    ...tools, name: 'ip', aliases: ['ipinfo', 'whois-ip'],
    desc: 'Look up an IP address', use: '[ip]',
    handler: async ({ m, args }) => {
      const { ipInfo } = await import('../lib/scraper.js');
      const data = await ipInfo((args[0] || '').replace(/[^\d.]/g, ''));
      return m.reply([
        `🌍 *IP Info*`,
        `IP      : ${data.ip}`,
        `City    : ${data.city}, ${data.region}`,
        `Country : ${data.country_name} (${data.country_code})`,
        `Network : ${data.org || data.asn}`,
        `Timezone: ${data.timezone}`,
        `Map     : ${data.latitude}, ${data.longitude}`,
      ].join('\n'));
    },
  },
  {
    ...tools, name: 'tempmail', aliases: ['tmpmail', 'mail'],
    desc: 'Generate a temporary email address',
    handler: async ({ m, sock }) => {
      const { fetchJson } = await import('../lib/functions.js');
      const data = await fetchJson('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
      const mail = Array.isArray(data) ? data[0] : null;
      if (!mail) throw new Error('temp-mail service unavailable');
      const [user, domain] = mail.split('@');
      const payload = interactivePayload({
        text: `📧 *Temporary Email*\n\n\`${mail}\`\n\nIt lives for 60 minutes. Check it with:\n\`${config.prefix}checkmail ${user} ${domain}\``,
        title: 'Temp Mail',
        buttons: [
          { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Address', id: mail, copy_code: mail }) },
          quickReply(`checkmail ${user} ${domain}`, '📥 Check Inbox'),
        ],
      });
      return sendInteractive(sock, m.chat, payload, `📧 ${mail}\nCheck with: ${config.prefix}checkmail ${user} ${domain}`, { quoted: m });
    },
  },
  {
    ...tools, name: 'checkmail', aliases: ['inbox'],
    desc: 'Check a temporary inbox', use: '<user> <domain>',
    handler: async ({ m, args }) => {
      const [login, domain] = args;
      if (!login || !domain) return m.reply(`ℹ️ Usage: \`${config.prefix}checkmail <user> <domain>\``);
      const { fetchJson } = await import('../lib/functions.js');
      const list = await fetchJson(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
      if (!Array.isArray(list) || !list.length) return m.reply('📭 Inbox is empty.');
      const first = list[0];
      const msg = await fetchJson(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${first.id}`);
      return m.reply(`📬 *${list.length} message(s)*\n\nLatest:\nFrom: ${msg.from}\nSubject: ${msg.subject}\nDate: ${msg.date}\n\n${String(msg.textBody || msg.htmlBody || '').replace(/<[^>]+>/g, '').slice(0, 2000)}`);
    },
  },
];

/* ────────────────────── fancy unicode styles ────────────────────── */
const MAPS = {
  bold:      { A: '𝗔', a: '𝗮', '0': '𝟬' },
  italic:    { A: '𝘈', a: '𝘢' },
  script:    { A: '𝒜', a: '𝒶' },
  boldscript:{ A: '𝓐', a: '𝓪' },
  gothic:    { A: '𝔄', a: '𝔞' },
  double:    { A: '𝔸', a: '𝕒', '0': '𝟘' },
  mono:      { A: '𝙰', a: '𝚊', '0': '𝟶' },
  smallcaps: { A: 'ᴀ', a: 'ᴀ' },
  bubbles:   { A: 'Ⓐ', a: 'ⓐ', '0': '⓪' },
  strike:    { A: 'A̶', a: 'a̶' },
};

function shift(ch, base) {
  const code = ch.codePointAt(0);
  if (ch >= 'A' && ch <= 'Z') return String.fromCodePoint(base.A.codePointAt(0) + (code - 65));
  if (ch >= 'a' && ch <= 'z') return String.fromCodePoint(base.a.codePointAt(0) + (code - 97));
  if (ch >= '0' && ch <= '9' && base['0']) return String.fromCodePoint(base['0'].codePointAt(0) + (code - 48));
  return ch;
}

function fancyStyles(text) {
  const chars = [...text];
  const out = [];

  // Mathematical-alphanumeric offsets
  for (const [name, map] of Object.entries(MAPS)) {
    if (['strike', 'smallcaps', 'bubbles'].includes(name)) continue;
    out.push(chars.map((c) => shift(c, map)).join(''));
  }
  // strikethrough
  out.push(chars.map((c) => (/[a-zA-Z0-9]/.test(c) ? `${c}\u0336` : c)).join(''));
  // circled
  out.push(chars.map((c) => (/[a-zA-Z0-9]/.test(c) ? `${c}\u20DD` : c)).join(''));
  // sQuArE caps
  out.push(chars.map((c, i) => (i % 2 ? c.toLowerCase() : c.toUpperCase())).join(''));
  // full-width
  out.push(chars.map((c) => (c === ' ' ? '\u3000' : /[!-~]/.test(c) ? String.fromCodePoint(c.codePointAt(0) + 0xfee0) : c)).join(''));
  // reversed
  out.push([...chars].reverse().join(''));

  return out.filter((s) => s && s.trim().length);
}
