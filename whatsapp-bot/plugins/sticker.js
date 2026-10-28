import { config } from '../src/config.js';
import { imageToWebp, videoToWebp, webpToMp4, toAudio, addExif, textToImage } from '../lib/converter.js';
import { downloadMedia } from '../lib/functions.js';
import { quickReply, interactivePayload, sendInteractive } from '../lib/buttons.js';

const stk = { category: 'Sticker', limit: 1, cooldown: 3 };

/** Grab media from either the message itself or the message it quotes. */
async function getMedia(m) {
  if (m.quoted?.isMedia) return { buffer: await m.quoted.download(), mtype: m.quoted.mtype, source: m.quoted };
  if (m.isMedia) return { buffer: await m.download(), mtype: m.mtype, source: m };
  return null;
}

export default [
  {
    ...stk, name: 'sticker', aliases: ['s', 'stiker', 'stickergif', 'sgif'],
    desc: 'Convert an image or short video into a sticker', media: 'quotedMedia',
    handler: async ({ m, sock, text }) => {
      const media = await getMedia(m);
      if (!media) return m.reply(`ℹ️ Reply to an image or a video (max 8s) with \`${config.prefix}s\``);

      const [pack = config.packName, author = config.packPublisher] = text.split('|').map((s) => s.trim()).filter(Boolean);

      if (media.mtype === 'stickerMessage') {
        const re = addExif(media.buffer, pack, author);
        return sock.sendMessage(m.chat, { sticker: re }, { quoted: m });
      }

      if (media.mtype === 'videoMessage') {
        const secs = media.source.msg?.seconds || 0;
        if (secs > 20) return m.reply('⏱️ Video too long — stickers support up to ~20 seconds (best: 8s).');
        const webp = await videoToWebp(media.buffer, Math.min(secs || 8, 12));
        return sock.sendMessage(m.chat, { sticker: webp }, { quoted: m });
      }

      const webp = await imageToWebp(media.buffer);
      return sock.sendMessage(m.chat, { sticker: addExif(webp, pack, author) }, { quoted: m });
    },
  },
  {
    ...stk, name: 'attp', aliases: ['ttp', 'textsticker'],
    desc: 'Turn text into a sticker (works offline)', use: '<text>',
    handler: async ({ m, sock, text }) => {
      if (!text) return m.reply(`ℹ️ Usage: \`${config.prefix}attp Kashif Tech\``);
      const png = await textToImage(text.slice(0, 60), { bg: 'white', fg: 'black', size: 72 });
      const webp = await imageToWebp(png);
      return sock.sendMessage(m.chat, { sticker: addExif(webp, config.packName, config.packPublisher) }, { quoted: m });
    },
  },
  {
    ...stk, name: 'toimg', aliases: ['toimage', 'sticker2img', 'photo'],
    desc: 'Convert a sticker back into an image', media: 'quotedMedia',
    handler: async ({ m, sock }) => {
      const media = await getMedia(m);
      if (!media || media.mtype !== 'stickerMessage') return m.reply(`ℹ️ Reply to a *sticker* with \`${config.prefix}toimg\``);
      if (media.source.msg?.isAnimated) return m.reply('ℹ️ That sticker is animated — use `.togif` instead.');
      return sock.sendMessage(m.chat, { image: media.buffer, mimetype: 'image/png', caption: `✅ Here is your image.\n⚡ ${config.botName}` }, { quoted: m });
    },
  },
  {
    ...stk, name: 'togif', aliases: ['sticker2gif', 'stomp4', 'tovideo'],
    desc: 'Convert an animated sticker into a GIF/video', media: 'quotedMedia',
    handler: async ({ m, sock }) => {
      const media = await getMedia(m);
      if (!media || media.mtype !== 'stickerMessage') return m.reply(`ℹ️ Reply to an animated sticker with \`${config.prefix}togif\``);
      const mp4 = await webpToMp4(media.buffer);
      return sock.sendMessage(m.chat, { video: mp4, gifPlayback: true, caption: '✅ Converted to GIF' }, { quoted: m });
    },
  },
  {
    ...stk, name: 'tomp3', aliases: ['toaudio', 'audio'],
    desc: 'Convert a video or voice note into MP3', media: 'quotedMedia',
    handler: async ({ m, sock }) => {
      const media = await getMedia(m);
      if (!media) return m.reply(`ℹ️ Reply to a video/voice note with \`${config.prefix}tomp3\``);
      const mp3 = await toAudio(media.buffer, 'mp4', 'mp3');
      return sock.sendMessage(m.chat, { audio: mp3, mimetype: 'audio/mpeg' }, { quoted: m });
    },
  },
  {
    ...stk, name: 'toptt', aliases: ['tovn', 'voicenote'],
    desc: 'Convert media into a voice note (PTT)', media: 'quotedMedia',
    handler: async ({ m, sock }) => {
      const media = await getMedia(m);
      if (!media) return m.reply('ℹ️ Reply to audio or video.');
      const mp3 = await toAudio(media.buffer, 'mp4', 'mp3');
      return sock.sendMessage(m.chat, { audio: mp3, mimetype: 'audio/mp4', ptt: true }, { quoted: m });
    },
  },
  {
    ...stk, name: 'stickermenu', aliases: ['stickers', 'smenu'],
    desc: 'Open the sticker tool button menu',
    handler: async ({ m, sock }) => {
      const payload = interactivePayload({
        text: `🖼️ *STICKER & MEDIA TOOLS*\n\nReply to media, then tap a tool 👇`,
        title: 'Sticker Tools',
        subtitle: config.botName,
        buttons: [
          quickReply('sticker', '🖼️ Image → Sticker'),
          quickReply('attp', '✍️ Text → Sticker'),
          quickReply('toimg', '🔁 Sticker → Image'),
          quickReply('togif', '🎞️ Sticker → GIF'),
          quickReply('tomp3', '🎵 Video → MP3'),
          quickReply('toptt', '🎙️ Media → Voice note'),
          quickReply('menu', '🏠 Main Menu'),
        ],
      });
      return sendInteractive(sock, m.chat, payload,
        '🖼️ Sticker tools:\n• .s (image/video → sticker)\n• .attp <text>\n• .toimg\n• .togif\n• .tomp3\n• .toptt', { quoted: m });
    },
  },
];
