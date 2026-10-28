import { config } from '../src/config.js';
import * as sc from '../lib/scraper.js';
import { quickReply, interactivePayload, sendInteractive } from '../lib/buttons.js';

const srch = { category: 'Search', limit: 1, cooldown: 4 };

export default [
  {
    ...srch, name: 'google', aliases: ['gsearch', 'search'],
    desc: 'Search the web', use: '<query>',
    handler: async ({ m, sock, text }) => {
      if (!text) return m.reply(`ℹ️ Usage: \`${config.prefix}google latest iPhone price in Pakistan\``);
      const res = await sc.googleSearch(text);
      const body = [`🔎 *Google results for* “${text}”`, '',
        ...res.map((r, i) => `*${i + 1}. ${r.title}*\n🔗 ${r.url}\n${r.snippet || ''}`), ''].join('\n');
      const payload = interactivePayload({
        text: body,
        title: 'Google Search',
        subtitle: `${res.length} results`,
        buttons: res.slice(0, 6).map((r) => ({
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({ display_text: `🌐 ${r.title.slice(0, 30)}`, url: r.url }),
        })),
      });
      return sendInteractive(sock, m.chat, payload, body, { quoted: m });
    },
  },
  {
    ...srch, name: 'gimage', aliases: ['image', 'img', 'pinterest'],
    desc: 'Search for images', use: '<query>',
    handler: async ({ m, sock, text }) => {
      if (!text) return m.reply(`ℹ️ Usage: \`${config.prefix}gimage minar e pakistan\``);
      const res = await sc.imageSearch(text, 5);
      for (const r of res) {
        try {
          await sock.sendMessage(m.chat, { image: { url: r.url }, caption: `🖼️ ${text}` }, { quoted: m });
          await new Promise((x) => setTimeout(x, 500));
        } catch { /* skip broken image */ }
      }
    },
  },
  {
    ...srch, name: 'wikipedia', aliases: ['wiki', 'wp'],
    desc: 'Search Wikipedia', use: '[lang] <topic>',
    handler: async ({ m, sock, args, text }) => {
      let lang = 'en';
      let q = text;
      if (/^[a-z]{2}$/i.test(args[0] || '') && args.length > 1) { lang = args[0].toLowerCase(); q = args.slice(1).join(' '); }
      if (!q) return m.reply(`ℹ️ Usage: \`${config.prefix}wiki Karachi\`  •  \`${config.prefix}wiki ur کراچی\``);
      const r = await sc.wikipedia(q, lang);
      const payload = interactivePayload({
        text: `📚 *${r.title}*\n\n${r.extract}`,
        title: 'Wikipedia',
        subtitle: lang,
        media: r.thumbnail ? { image: r.thumbnail } : undefined,
        buttons: r.url ? [{ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📖 Read Full Article', url: r.url }) }] : [],
      });
      return sendInteractive(sock, m.chat, payload, `📚 ${r.title}\n\n${r.extract}\n\n${r.url || ''}`, { quoted: m });
    },
  },
  {
    ...srch, name: 'weather', aliases: ['mausam', 'forecast'],
    desc: 'Current weather for a city', use: '<city>', limit: 0,
    handler: async ({ m, text }) => {
      const city = text || 'Karachi';
      const w = await sc.weather(city);
      return m.reply([
        `🌤️ *Weather — ${w.location}*`,
        '',
        `🌡️ Temperature : ${w.temp}°C (feels ${w.feels}°C)`,
        `☁️ Condition   : ${w.desc}`,
        `💧 Humidity    : ${w.humidity}%`,
        `💨 Wind        : ${w.wind}`,
        `👁️ Visibility  : ${w.visibility} km`,
        `🔽 Pressure    : ${w.pressure} hPa`,
        `☀️ UV index    : ${w.uv}`,
      ].join('\n'));
    },
  },
  {
    ...srch, name: 'lyrics', aliases: ['lirik', 'songlyrics'],
    desc: 'Find song lyrics', use: '<artist>|<title>', limit: 0,
    handler: async ({ m, text }) => {
      const [artist, title] = text.split('|').map((s) => s.trim());
      if (!artist || !title) return m.reply(`ℹ️ Usage: \`${config.prefix}lyrics Atif Aslam|Tajdar-e-Haram\``);
      const l = await sc.lyrics(artist, title);
      return m.reply(`🎵 *${title}* — ${artist}\n\n${l.slice(0, 3500)}`);
    },
  },
  {
    ...srch, name: 'waifu', aliases: ['anime', 'neko'],
    desc: 'Get a random anime image (SFW)', use: '[waifu|neko|shinobu|megumin]', limit: 0,
    handler: async ({ m, sock, args }) => {
      const cat = ['waifu', 'neko', 'shinobu', 'megumin'].includes((args[0] || '').toLowerCase()) ? args[0].toLowerCase() : 'waifu';
      const url = await sc.randomImage(cat);
      if (!url) throw new Error('image service unavailable');
      return sock.sendMessage(m.chat, { image: { url }, caption: `🌸 Random ${cat}` }, { quoted: m });
    },
  },
  {
    ...srch, name: 'apk', aliases: ['app', 'playstore'],
    desc: 'Find an app on a store mirror', use: '<name>',
    handler: async ({ m, sock, text }) => {
      if (!text) return m.reply(`ℹ️ Usage: \`${config.prefix}apk whatsapp\``);
      const res = await sc.googleSearch(`site:apkpure.com ${text}`);
      const payload = interactivePayload({
        text: `📱 *${text}*\n\n${res.slice(0, 5).map((r, i) => `${i + 1}. ${r.title}\n${r.url}`).join('\n')}`,
        title: 'App Search',
        buttons: res.slice(0, 5).map((r) => ({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: `⬇️ ${r.title.slice(0, 30)}`, url: r.url }) })),
      });
      return sendInteractive(sock, m.chat, payload, res.slice(0, 5).map((r) => `• ${r.title}\n  ${r.url}`).join('\n'), { quoted: m });
    },
  },
];
