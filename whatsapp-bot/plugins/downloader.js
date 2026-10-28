import { config } from '../src/config.js';
import * as sc from '../lib/scraper.js';
import { quickReply, singleSelect, interactivePayload, sendInteractive } from '../lib/buttons.js';
import { getUrls, formatBytes, sleep } from '../lib/functions.js';

const dl = { category: 'Downloader', limit: 1, cooldown: 4 };

const needUrl = (text, label) => {
  const u = getUrls(text)[0];
  if (!u) throw new Error(`Send a valid ${label} link, e.g. \`${config.prefix}${label} https://…\``);
  return u;
};

export default [
  /* ══════════════════ TikTok ══════════════════ */
  {
    ...dl, name: 'tiktok', aliases: ['tt', 'tiktokdl', 'ttnowm'],
    desc: 'Download a TikTok video without watermark', use: '<url>', limit: 2,
    handler: async ({ m, sock, text }) => {
      const url = needUrl(text, 'tiktok');
      const r = await sc.tiktok(url);
      const best = r.media.find((x) => x.quality === 'HD' && x.type === 'video') ||
                   r.media.find((x) => x.type === 'video') || r.media[0];
      if (!best) throw new Error('No downloadable media found.');

      if (best.type === 'image') {
        for (const img of r.media.filter((x) => x.type === 'image')) {
          await sock.sendMessage(m.chat, { image: { url: img.url }, caption: `📸 ${r.title.slice(0, 120)}` }, { quoted: m });
          await sleep(500);
        }
        return;
      }

      await sock.sendMessage(m.chat, {
        video: { url: best.url },
        caption: [
          `🎬 *TIKTOK DOWNLOADER*`,
          ``,
          `👤 Author   : ${r.author}`,
          `⏱️ Duration : ${r.duration}s`,
          `▶️ Plays    : ${r.stats?.play || 0}`,
          `❤️ Likes     : ${r.stats?.like || 0}`,
          `💬 Comments : ${r.stats?.comment || 0}`,
          ``,
          `📝 ${r.title.slice(0, 300)}`,
          ``,
          `⚡ ${config.botName}`,
        ].join('\n'),
      }, { quoted: m });

      if (r.media.some((x) => x.type === 'audio')) {
        const audio = r.media.find((x) => x.type === 'audio');
        return sock.sendMessage(m.chat, { audio: { url: audio.url }, mimetype: 'audio/mpeg' }, { quoted: m });
      }
    },
  },
  {
    ...dl, name: 'tiktokmp3', aliases: ['ttaudio', 'ttmp3'],
    desc: 'Download only the TikTok audio', use: '<url>',
    handler: async ({ m, sock, text }) => {
      const url = needUrl(text, 'tiktokmp3');
      const r = await sc.tiktok(url);
      const audio = r.media.find((x) => x.type === 'audio');
      if (!audio) throw new Error('No audio track on that TikTok.');
      return sock.sendMessage(m.chat, {
        audio: { url: audio.url },
        mimetype: 'audio/mpeg',
        ptt: false,
        contextInfo: { externalAdReply: { title: r.title.slice(0, 60), body: r.author, mediaType: 2, thumbnailUrl: r.cover } },
      }, { quoted: m });
    },
  },

  /* ══════════════════ Instagram ══════════════════ */
  {
    ...dl, name: 'instagram', aliases: ['ig', 'igdl', 'igreels'],
    desc: 'Download Instagram reels / posts / videos', use: '<url>', limit: 2,
    handler: async ({ m, sock, text }) => {
      const url = needUrl(text, 'ig');
      const r = await sc.instagram(url);
      const urls = r.urls || [r.url];
      for (const [i, u] of urls.slice(0, 10).entries()) {
        if (/\.(mp4|mov|webm)(\?|$)/i.test(u) || urls.length === 1) {
          try {
            await sock.sendMessage(m.chat, { video: { url: u }, caption: i === 0 ? `📥 *Instagram*\n${r.title || url}\n\n⚡ ${config.botName}` : '' }, { quoted: m });
            continue;
          } catch { /* fall through to image */ }
        }
        await sock.sendMessage(m.chat, { image: { url: u }, caption: i === 0 ? `📥 *Instagram* (${urls.length} media)\n\n⚡ ${config.botName}` : '' }, { quoted: m });
        await sleep(600);
      }
    },
  },

  /* ══════════════════ Facebook ══════════════════ */
  {
    ...dl, name: 'facebook', aliases: ['fb', 'fbdl', 'fbvideo'],
    desc: 'Download a Facebook video', use: '<url>', limit: 2,
    handler: async ({ m, sock, text }) => {
      const url = needUrl(text, 'fb');
      const r = await sc.facebook(url);
      return sock.sendMessage(m.chat, {
        video: { url: r.url },
        caption: `📥 *Facebook Video*\n${r.title || url}\n\n⚡ ${config.botName}`,
      }, { quoted: m });
    },
  },

  /* ══════════════════ Twitter / X ══════════════════ */
  {
    ...dl, name: 'twitter', aliases: ['x', 'tw', 'twitterdl'],
    desc: 'Download a Twitter/X video', use: '<url>',
    handler: async ({ m, sock, text }) => {
      const url = needUrl(text, 'twitter');
      const r = await sc.twitter(url);
      return sock.sendMessage(m.chat, {
        video: { url: r.url },
        caption: `📥 *Twitter / X*\n${r.title || url}\n\n⚡ ${config.botName}`,
      }, { quoted: m });
    },
  },

  /* ══════════════════ YouTube ══════════════════ */
  {
    ...dl, name: 'yts', aliases: ['ytsearch', 'play'],
    desc: 'Search YouTube and pick a video', use: '<query>', limit: 1,
    handler: async ({ m, sock, text }) => {
      if (!text) throw new Error(`Usage: \`${config.prefix}yts <song name>\``);
      const res = await sc.ytSearch(text, 8);
      if (!res.length) throw new Error('Nothing found on YouTube.');
      const payload = interactivePayload({
        text: [
          `🔎 *YouTube results for* “${text}”`,
          '',
          ...res.map((v, i) => `${i + 1}. ${v.title}\n   📺 ${v.channel} • ${v.url}`),
          '',
          `Tap a button to download 👇`,
        ].join('\n'),
        title: 'YouTube Search',
        subtitle: `${res.length} results`,
        buttons: res.slice(0, 6).map((v) => quickReply(`ytmp3 ${v.id}`, `🎵 ${v.title.slice(0, 34)}`, v.channel)),
        sections: [{
          title: '🎬 All results',
          rows: res.map((v) => ({ header: v.channel, title: `🎵 ${v.title}`, description: `Audio → ${v.url}`, id: `ytmp3 ${v.id}` })),
        }, {
          title: '📹 Video instead',
          rows: res.map((v) => ({ header: v.channel, title: `🎬 ${v.title}`, description: v.url, id: `ytmp4 ${v.id}` })),
        }],
      });
      const fallback = res.map((v, i) => `${i + 1}. ${v.title}\n   ${v.url}`).join('\n');
      return sendInteractive(sock, m.chat, payload, fallback, { quoted: m });
    },
  },
  {
    ...dl, name: 'ytmp3', aliases: ['yta', 'youtubemp3'],
    desc: 'Download YouTube audio (mp3)', use: '<url|videoId>', limit: 2,
    handler: async ({ m, sock, args, text }) => {
      const id = extractYtId(text || args[0] || '');
      if (!id) throw new Error('Send a YouTube link or video ID.');
      const r = await sc.ytDownload(id, 'mp3');
      return sock.sendMessage(m.chat, {
        audio: { url: r.url },
        mimetype: 'audio/mpeg',
        ptt: false,
        contextInfo: { externalAdReply: { title: r.title || 'YouTube Audio', body: config.botName, mediaType: 2, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
      }, { quoted: m });
    },
  },
  {
    ...dl, name: 'ytmp4', aliases: ['ytv', 'youtubemp4'],
    desc: 'Download YouTube video (mp4)', use: '<url|videoId>', limit: 3,
    handler: async ({ m, sock, args, text }) => {
      const id = extractYtId(text || args[0] || '');
      if (!id) throw new Error('Send a YouTube link or video ID.');
      const r = await sc.ytDownload(id, 'mp4');
      return sock.sendMessage(m.chat, {
        video: { url: r.url },
        caption: `🎬 *YouTube Video*\n${r.title || id}\n\n⚡ ${config.botName}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      }, { quoted: m });
    },
  },

  /* ══════════════════ MediaFire ══════════════════ */
  {
    ...dl, name: 'mediafire', aliases: ['mf', 'mediafiredl'],
    desc: 'Get a direct MediaFire download link', use: '<url>',
    handler: async ({ m, sock, text }) => {
      const url = needUrl(text, 'mediafire');
      const r = await sc.mediafire(url);
      const payload = interactivePayload({
        text: `📦 *MediaFire*\n\n📄 Name : ${r.name}\n💾 Size : ${r.size || 'unknown'}\n🔗 Link : ${r.url}`,
        title: 'MediaFire',
        buttons: [
          { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '⬇️ Open Link', url: r.url }) },
          quickReply('tourl', '🔁 Re-upload'),
        ],
      });
      return sendInteractive(sock, m.chat, payload, `📦 MediaFire\nName: ${r.name}\nSize: ${r.size}\nLink: ${r.url}`, { quoted: m });
    },
  },

  /* ══════════════════ Generic ══════════════════ */
  {
    ...dl, name: 'get', aliases: ['fetch', 'url'],
    desc: 'Fetch any URL and return its content', use: '<url>', limit: 0,
    handler: async ({ m, sock, text }) => {
      const url = needUrl(text, 'get');
      const axios = (await import('axios')).default;
      const res = await axios.get(url, { timeout: 30000, maxContentLength: 8 * 1024 * 1024, responseType: 'arraybuffer' });
      const ct = res.headers['content-type'] || '';
      const buf = Buffer.from(res.data);
      if (ct.startsWith('image/')) return sock.sendMessage(m.chat, { image: buf, caption: `🖼️ ${url}` }, { quoted: m });
      if (ct.startsWith('video/')) return sock.sendMessage(m.chat, { video: buf, caption: `🎬 ${url}` }, { quoted: m });
      if (ct.startsWith('audio/')) return sock.sendMessage(m.chat, { audio: buf, mimetype: ct }, { quoted: m });
      if (ct.includes('json')) return m.reply('```json\n' + buf.toString('utf8').slice(0, 3500) + '\n```');
      return m.reply(buf.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3500) || '(empty response)');
    },
  },
];

function extractYtId(input = '') {
  const s = String(input).trim();
  const m =
    s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/) ||
    s.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}
