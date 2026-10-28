import { config } from '../src/config.js';
import * as sc from '../lib/scraper.js';
import { quickReply, singleSelect, interactivePayload, sendInteractive } from '../lib/buttons.js';
import { pickRandom } from '../lib/functions.js';

const isl = { category: 'Islamic', limit: 0, cooldown: 4 };

const PRAYER_ORDER = [
  ['Fajr', '🌅'], ['Sunrise', '🌄'], ['Dhuhr', '☀️'],
  ['Asr', '🌤️'], ['Maghrib', '🌇'], ['Isha', '🌙'],
];

const QUOTES = [
  '“Indeed, with hardship comes ease.” — Qur’an 94:6',
  '“And He found you lost and guided [you].” — Qur’an 93:7',
  '“Verily, in the remembrance of Allah do hearts find rest.” — Qur’an 13:28',
  '“Do not despair of the mercy of Allah.” — Qur’an 39:53',
  '“Allah does not burden a soul beyond that it can bear.” — Qur’an 2:286',
  '“And whoever relies upon Allah — then He is sufficient for him.” — Qur’an 65:3',
  'The best among you are those who have the best manners and character. — Bukhari',
  'Smiling in your brother’s face is charity. — Tirmidhi',
];

export default [
  {
    ...isl, name: 'prayertime', aliases: ['salat', 'adzan', 'namaz', 'prayer'],
    desc: 'Prayer times for a city (default: Karachi)', use: '[city] [country]',
    handler: async ({ m, sock, args, text }) => {
      const [city = 'Karachi', country = 'Pakistan'] = text ? text.split(',').map((s) => s.trim()) : (args.length ? [args.join(' '), 'Pakistan'] : []);
      const data = await sc.prayerTimes(city, country, 1);
      const t = data.timings || {};
      const d = data.date || {};
      const body = [
        `╭───「 🕌 *PRAYER TIMES* 」`,
        `│ 📍 ${d.readable || `${city}, ${country}`}`,
        `│ 📅 ${d.gregorian?.date || ''} ${d.hijri ? `(${d.hijri.date} AH)` : ''}`,
        `│ 🧭 Method: ${data.meta?.method?.name || 'Univ. of Islamic Sciences, Karachi'}`,
        `╰────────────────────`,
        '',
        ...PRAYER_ORDER.map(([k, ic]) => `${ic} *${k}* — ${t[k] || '—'}`),
        '',
        `🌃 *Imsak* ${t.Imsak || '—'}  •  🌌 *Midnight* ${t.Midnight || '—'}`,
      ].join('\n');

      const payload = interactivePayload({
        text: body,
        title: '🕌 Prayer Times',
        subtitle: `${city}, ${country}`,
        buttons: [
          quickReply('prayertime Karachi', '📍 Karachi'),
          quickReply('prayertime Lahore', '📍 Lahore'),
          quickReply('prayertime Islamabad', '📍 Islamabad'),
          quickReply('qibla', '🧭 Qibla Direction'),
          quickReply('menu', '🏠 Main Menu'),
        ],
      });
      return sendInteractive(sock, m.chat, payload, body, { quoted: m });
    },
  },
  {
    ...isl, name: 'quran', aliases: ['surah', 'quransurah'],
    desc: 'Read a surah with Arabic, English & audio', use: '<surah number> [ayah]',
    handler: async ({ m, sock, args }) => {
      const n = parseInt(args[0], 10);
      if (!n || n < 1 || n > 114) return m.reply(`ℹ️ Usage: \`${config.prefix}quran 36\`  (1 – 114)\nOptionally: \`${config.prefix}quran 2 255\` for one ayah.`);
      const s = await sc.quranSurah(n);
      const ayah = parseInt(args[1], 10);

      if (ayah) {
        const a = s.verses.find((v) => v.n === ayah);
        if (!a) return m.reply(`❌ Surah ${n} has only ${s.verses.length} ayahs.`);
        const text = `📖 *Surah ${s.englishName} (${s.number}) — Ayah ${a.n}*\n\n${a.arabic}\n\n🇬🇧 ${a.english}`;
        await m.reply(text);
        if (a.audio) return sock.sendMessage(m.chat, { audio: { url: a.audio }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
        return;
      }

      const preview = s.verses.slice(0, 5).map((a) => `${a.n}. ${a.arabic}\n    ${a.english.slice(0, 160)}`).join('\n\n');
      const text = [
        `📖 *Surah ${s.englishName}* (${s.number})`,
        `${s.name}  •  ${s.verses.length} ayahs  •  ${s.englishTranslation}`,
        '',
        preview,
        s.verses.length > 5 ? `\n… ${s.verses.length - 5} more ayahs.` : '',
        '',
        `Use \`${config.prefix}quran ${s.number} <ayah#>\` for a single ayah + recitation.`,
      ].join('\n');

      const payload = interactivePayload({
        text,
        title: `📖 ${s.englishName}`,
        subtitle: `${s.verses.length} ayahs`,
        buttons: s.verses.slice(0, 7).map((a) => quickReply(`quran ${s.number} ${a.n}`, `Ayah ${a.n}`, a.english.slice(0, 40))),
      });
      return sendInteractive(sock, m.chat, payload, text, { quoted: m });
    },
  },
  {
    ...isl, name: 'ayatulkursi', aliases: ['kursi', 'ayatkursi'],
    desc: 'Ayat-ul-Kursi with translation & audio',
    handler: async ({ m, sock }) => {
      const s = await sc.quranSurah(2);
      const a = s.verses.find((v) => v.n === 255);
      if (!a) throw new Error('could not fetch ayah');
      await m.reply(`📖 *Ayat-ul-Kursi* (Al-Baqarah 2:255)\n\n${a.arabic}\n\n🇬🇧 ${a.english}`);
      if (a.audio) return sock.sendMessage(m.chat, { audio: { url: a.audio }, mimetype: 'audio/mpeg' }, { quoted: m });
    },
  },
  {
    ...isl, name: 'asmaulhusna', aliases: ['99names', 'names', 'allahnames'],
    desc: 'The 99 beautiful names of Allah', use: '[number]',
    handler: async ({ m, sock, args }) => {
      const names = await sc.asmaulHusna();
      if (!names.length) throw new Error('names service unavailable');
      const n = parseInt(args[0], 10);
      if (n && names[n - 1]) {
        const x = names[n - 1];
        return m.reply(`✨ *${x.number}. ${x.name}*\n${x.transliteration}\n\n🇬🇧 ${x.en?.meaning || x.translation?.en?.meaning || ''}`);
      }
      const sample = names.slice(0, 15).map((x) => `*${x.number}.* ${x.name} — ${x.transliteration}`).join('\n');
      const payload = interactivePayload({
        text: `✨ *Asma-ul-Husna*\nThe 99 beautiful names of Allah\n\n${sample}\n\n… and ${names.length - 15} more.\nUse \`${config.prefix}99names <number>\` for a single name.`,
        title: '99 Names of Allah',
        buttons: [
          singleSelect('📿 View a name', [{
            title: 'Asma-ul-Husna',
            rows: names.slice(0, 30).map((x) => ({ title: `${x.number}. ${x.transliteration}`, description: x.name, id: `asmaulhusna ${x.number}` })),
          }]),
          quickReply('menu', '🏠 Main Menu'),
        ],
      });
      return sendInteractive(sock, m.chat, payload, sample, { quoted: m });
    },
  },
  {
    ...isl, name: 'qibla', aliases: ['qibladirection'],
    desc: 'Qibla direction in degrees', use: '[lat,long]',
    handler: async ({ m, args }) => {
      let [lat, lon] = [24.8607, 67.0011]; // Karachi default
      const raw = (args[0] || '').split(',').map(parseFloat);
      if (raw.length === 2 && raw.every(Number.isFinite)) [lat, lon] = raw;
      const dir = await sc.qiblaDirection(lat, lon);
      if (dir === undefined) throw new Error('could not compute qibla');
      const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(dir / 45) % 8];
      return m.reply(`🧭 *Qibla Direction*\n\n📍 Location : ${lat}, ${lon}\n🕋 Bearing  : *${Number(dir).toFixed(2)}°* from true north\n🧭 Compass  : ${compass}\n\nFace that bearing from your location to pray towards the Ka'bah.`);
    },
  },
  {
    ...isl, name: 'islamicquote', aliases: ['deenquote', 'hikmah'],
    desc: 'A random Islamic reminder',
    handler: async ({ m }) => m.reply(`🕌 *Reminder*\n\n${pickRandom(QUOTES)}`),
  },
  {
    ...isl, name: 'islamic', aliases: ['deen', 'islamicmenu'],
    desc: 'Open the Islamic button menu',
    handler: async ({ m, sock }) => {
      const payload = interactivePayload({
        text: `🕌 *ISLAMIC MENU*\n\nAssalam-o-Alaikum!\nPrayer times, Qur'an, Asma-ul-Husna and more.`,
        title: 'Islamic Menu',
        subtitle: config.botName,
        buttons: [
          quickReply('prayertime', '🕌 Prayer Times'),
          quickReply('quran', '📖 Qur’an Surah'),
          quickReply('ayatulkursi', '✨ Ayat-ul-Kursi'),
          quickReply('asmaulhusna', '📿 99 Names'),
          quickReply('qibla', '🧭 Qibla'),
          quickReply('islamicquote', '💬 Reminder'),
          quickReply('menu', '🏠 Main Menu'),
        ],
      });
      return sendInteractive(sock, m.chat, payload, '🕌 Islamic:\n• .prayertime\n• .quran <no>\n• .ayatulkursi\n• .99names\n• .qibla\n• .islamicquote', { quoted: m });
    },
  },
];
