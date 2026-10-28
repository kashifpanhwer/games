import axios from 'axios';
import { config } from '../src/config.js';
import { pickRandom } from './functions.js';

/**
 * ─────────────────────────────────────────────────────────────
 *  SCRAPER LIBRARY
 *  Every function returns normalised JSON. Where a service needs
 *  a key, the key is read from .env. Where a public endpoint may
 *  disappear, several are tried in order.
 * ─────────────────────────────────────────────────────────────
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const http = axios.create({ timeout: 30000, headers: { 'User-Agent': UA } });

/* ══════════════════════════ TikTok ══════════════════════════ */

export async function tiktok(url) {
  const { data } = await http.get('https://api.tikwm.com/api/', { params: { url, hd: 1 } });
  if (!data?.data) throw new Error(data?.msg || 'tiktok: no data');
  const d = data.data;
  const media = [];
  if (d.play) media.push({ type: 'video', quality: 'no-watermark', url: d.play });
  if (d.hdplay) media.push({ type: 'video', quality: 'HD', url: d.hdplay });
  if (d.wmplay) media.push({ type: 'video', quality: 'watermark', url: d.wmplay });
  if (d.music) media.push({ type: 'audio', quality: 'mp3', url: d.music });
  if (Array.isArray(d.images)) d.images.forEach((u) => media.push({ type: 'image', url: u }));
  return {
    title: d.title || '',
    author: d.author?.nickname || d.author?.unique_id || 'TikTok',
    duration: d.duration || 0,
    cover: d.cover || d.origin_cover || '',
    stats: { play: d.play_count, like: d.digg_count, comment: d.comment_count, share: d.share_count },
    media,
  };
}

/* ══════════════════════════ YouTube ══════════════════════════ */

export async function ytSearch(query, limit = 10) {
  const { data } = await http.get('https://yt.lemnoslife.com/noKey/search', {
    params: { q: query, part: 'snippet', type: 'video', maxResults: limit },
  });
  const items = data?.items || [];
  return items.map((it) => ({
    id: it.id?.videoId || it.id,
    title: it.snippet?.title || '',
    channel: it.snippet?.channelTitle || '',
    published: it.snippet?.publishedAt || '',
    thumbnail: it.snippet?.thumbnails?.maxres?.url || it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.default?.url || '',
    description: (it.snippet?.description || '').slice(0, 200),
    url: `https://youtu.be/${it.id?.videoId || it.id}`,
  })).filter((v) => v.id);
}

/**
 * YouTube audio/video download. Uses a provider chain because these
 * endpoints change often. Set YT_API in .env to pin your own.
 */
const YT_PROVIDERS = [
  async (id, type) => {
    const { data } = await http.get(`https://api.dhamzxploit.my.id/api/ytmp4`, { params: { url: `https://youtu.be/${id}` } });
    return normalizeDl(data);
  },
  async (id) => {
    const { data } = await http.get('https://api.tikwm.com/api/youtube', { params: { url: `https://youtu.be/${id}` } });
    return normalizeDl(data);
  },
];

export async function ytDownload(videoId, type = 'mp3') {
  const errors = [];
  const chain = config.ytApi ? [async () => normalizeDl((await http.get(config.ytApi, { params: { url: `https://youtu.be/${videoId}`, type } })).data), ...YT_PROVIDERS] : YT_PROVIDERS;
  for (const p of chain) {
    try {
      const r = await p(videoId, type);
      if (r?.url) return r;
      throw new Error('empty result');
    } catch (e) { errors.push(e.message); }
  }
  throw new Error(`YouTube download failed (${errors.join('; ')})`);
}

/* ══════════════ Instagram / Facebook / Twitter ══════════════ */

const GENERIC_PROVIDERS = [
  (u) => http.get('https://api.dhamzxploit.my.id/api/igdl', { params: { url: u } }).then((r) => r.data),
  (u) => http.get('https://widipe.com/igdl', { params: { url: u } }).then((r) => r.data),
  (u) => http.get('https://api.agatz.xyz/api/instagram', { params: { url: u } }).then((r) => r.data),
];

const FB_PROVIDERS = [
  (u) => http.get('https://api.dhamzxploit.my.id/api/facebook', { params: { url: u } }).then((r) => r.data),
  (u) => http.get('https://widipe.com/fbdown', { params: { url: u } }).then((r) => r.data),
];

const TW_PROVIDERS = [
  (u) => http.get('https://api.dhamzxploit.my.id/api/twitter', { params: { url: u } }).then((r) => r.data),
  (u) => http.get('https://widipe.com/twitterdl', { params: { url: u } }).then((r) => r.data),
];

export function normalizeDl(data) {
  if (!data) return null;
  const pick = (o) => o?.url || o?.link || o?.download || o?.src || o?.videoUrl || o?.audioUrl || null;
  if (typeof data === 'string') return { url: data };
  if (data.status === false || data.error) throw new Error(data.msg || data.message || data.reason || 'provider error');

  const container = data.result ?? data.data ?? data.response ?? data;
  if (Array.isArray(container)) {
    const urls = container.map((it) => (typeof it === 'string' ? it : pick(it))).filter(Boolean);
    if (urls.length) return { title: data.title || '', url: urls[0], urls, thumbnail: data.thumbnail || pick(container[0]?.thumbnail ? { url: container[0].thumbnail } : null) };
  }
  const medias = container?.medias || container?.urls || container?.media || container?.video;
  if (Array.isArray(medias)) {
    const urls = medias.map((mm) => (typeof mm === 'string' ? mm : mm.url || mm.downloadUrl || mm.link)).filter(Boolean);
    if (urls.length) return { title: container.title || '', url: urls[0], urls };
  }
  const url = pick(container) || pick(data);
  if (url) return { title: container.title || data.title || '', url, thumbnail: container.thumbnail || data.thumbnail || '' };
  return null;
}

async function tryProviders(providers, url, label) {
  const errors = [];
  for (const p of providers) {
    try {
      const res = normalizeDl(await p(url));
      if (res?.url) return res;
      throw new Error('empty result');
    } catch (e) { errors.push(e.message.slice(0, 80)); }
  }
  throw new Error(`${label} download failed (${errors.join('; ')})`);
}

export const instagram = (url) => tryProviders(GENERIC_PROVIDERS, url, 'Instagram');
export const facebook = (url) => tryProviders(FB_PROVIDERS, url, 'Facebook');
export const twitter = (url) => tryProviders(TW_PROVIDERS, url, 'Twitter/X');

/* ══════════════════════════ MediaFire ══════════════════════════ */

export async function mediafire(url) {
  const { data } = await http.get(url);
  const html = String(data);
  const link = html.match(/href="(https:\/\/download[^"]+)"/)?.[1];
  const name = html.match(/<div class="dl-btn-label"[^>]*>([^<]+)</)?.[1] || html.match(/aria-label="([^"]+)"/)?.[1] || 'mediafire-file';
  const size = html.match(/<div class="dl-info">\s*<div class="name">[^<]*<\/div>\s*<div class="size">([^<]+)</)?.[1] || '';
  if (!link) throw new Error('mediafire: download link not found (file may be private)');
  return { name: name.trim(), size: size.trim(), url: link };
}

/* ══════════════════════════ Search engines ══════════════════════════ */

export async function googleSearch(query) {
  const { data } = await http.get('https://html.duckduckgo.com/html/', {
    params: { q: query },
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });
  const html = String(data);
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let mm;
  while ((mm = re.exec(html)) && out.length < 8) {
    const href = decodeURIComponent((mm[1].match(/uddg=([^&]+)/) || [, mm[1]])[1]);
    out.push({
      title: mm[2].replace(/<[^>]+>/g, '').trim(),
      url: href,
      snippet: mm[3].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').trim(),
    });
  }
  if (!out.length) {
    const { data: ddg } = await http.get('https://api.duckduckgo.com/', { params: { q: query, format: 'json', no_html: 1 } });
    if (ddg?.AbstractText) out.push({ title: ddg.Heading, url: ddg.AbstractURL, snippet: ddg.AbstractText });
    (ddg?.RelatedTopics || []).slice(0, 6).forEach((t) => {
      if (t.Text && t.FirstURL) out.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text });
    });
  }
  if (!out.length) throw new Error('google: no results');
  return out;
}

export async function imageSearch(query, limit = 6) {
  const { data } = await http.get('https://api.duckduckgo.com/', { params: { q: query, format: 'json', no_html: 1 } });
  const out = [];
  (data?.Results || []).concat(data?.RelatedTopics || []).forEach((t) => {
    if (t.Icon?.URL) out.push({ url: t.Icon.URL, title: t.Text || query });
  });
  // fallback: Bing image JSON is not key-free, so use picsum-like keyword services
  if (!out.length) {
    for (let i = 0; i < limit; i++) out.push({ url: `https://source.unsplash.com/720x1280/?${encodeURIComponent(query)}&sig=${i}`, title: query });
  }
  return out.slice(0, limit);
}

export async function wikipedia(query, lang = 'en') {
  const { data } = await http.get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g, '_'))}`);
  if (!data?.extract) throw new Error('wikipedia: page not found');
  return { title: data.title, extract: data.extract, url: data.content_urls?.desktop?.page, thumbnail: data.thumbnail?.source };
}

export async function weather(city) {
  const { data } = await http.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
  const cur = data?.current_condition?.[0];
  if (!cur) throw new Error('weather: city not found');
  const area = data.nearest_area?.[0];
  return {
    location: `${area?.areaName?.[0]?.value || city}, ${area?.country?.[0]?.value || ''}`,
    temp: cur.temp_C, feels: cur.FeelsLikeC, humidity: cur.humidity,
    desc: cur.weatherDesc?.[0]?.value, wind: `${cur.windspeedKmph} km/h ${cur.winddir16Point}`,
    visibility: cur.visibility, pressure: cur.pressure, uv: cur.uvIndex,
  };
}

export async function lyrics(artist, title) {
  const { data } = await http.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
  if (!data?.lyrics) throw new Error('lyrics: not found');
  return data.lyrics.trim();
}

/* ══════════════════════════ Islamic ══════════════════════════ */

export async function prayerTimes(city = 'Karachi', country = 'Pakistan', method = 1) {
  const { data } = await http.get('https://api.aladhan.com/v1/timingsByCity', { params: { city, country, method } });
  if (data?.code !== 200) throw new Error('prayer times: request failed');
  return data.data;
}

export async function quranSurah(number) {
  const { data } = await http.get(`https://api.alquran.cloud/v1/surah/${number}/editions/quran-uthmani,en.asad,ar.alafasy`);
  if (data?.code !== 200) throw new Error('quran: surah not found');
  const [ar, en, audio] = data.data;
  return {
    number: ar.number, name: ar.name, englishName: ar.englishName, englishTranslation: ar.englishNameTranslation,
    verses: ar.ayahs.map((a, i) => ({
      n: a.numberInSurah,
      arabic: a.text,
      english: en.ayahs[i]?.text || '',
      audio: audio.ayahs[i]?.audio || '',
    })),
  };
}

export async function asmaulHusna() {
  const { data } = await http.get('https://api.aladhan.com/v1/asmaAlHusna');
  return data?.data || [];
}

export async function qiblaDirection(latitude, longitude) {
  const { data } = await http.get(`https://api.aladhan.com/v1/qibla/${latitude}/${longitude}`);
  return data?.data?.direction;
}

/* ══════════════════════════ Utilities ══════════════════════════ */

export async function translate(text, target = 'ur') {
  const { data } = await http.get('https://translate.googleapis.com/translate_a/single', {
    params: { client: 'gtx', sl: 'auto', tl: target, dt: 't', q: text },
  });
  const out = (data?.[0] || []).map((seg) => seg[0]).join('');
  return { text: out, from: data?.[2] || 'auto', to: target };
}

export async function shortLink(url) {
  const { data } = await http.get('https://tinyurl.com/api-create.php', { params: { url } });
  if (!/^https?:\/\//.test(String(data))) throw new Error('shortlink failed');
  return String(data).trim();
}

export async function ipInfo(ip = '') {
  const { data } = await http.get(`https://ipapi.co/${ip}json/`);
  return data;
}

export async function randomImage(category = 'waifu') {
  const { data } = await http.get(`https://api.waifu.pics/sfw/${category}`);
  return data?.url;
}

export const randomQuote = async () => {
  const { data } = await http.get('https://api.quotable.io/random');
  return Array.isArray(data) ? pickRandom(data) : data;
};

export async function gpt(prompt, { system } = {}) {
  if (config.openaiKey) {
    const { data } = await http.post(
      'https://api.openai.com/v1/chat/completions',
      { model: 'gpt-4o-mini', messages: [{ role: 'system', content: system || 'You are a helpful assistant.' }, { role: 'user', content: prompt }] },
      { headers: { Authorization: `Bearer ${config.openaiKey}` } },
    );
    return data?.choices?.[0]?.message?.content;
  }
  if (config.geminiKey) {
    const { data } = await http.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiKey}`,
      { contents: [{ parts: [{ text: system ? `${system}\n\n${prompt}` : prompt }] }] },
    );
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || null;
  }
  throw new Error('No AI key configured. Add GEMINI_API_KEY or OPENAI_API_KEY to .env');
}

export default {
  tiktok, ytSearch, ytDownload, instagram, facebook, twitter, mediafire,
  googleSearch, imageSearch, wikipedia, weather, lyrics, prayerTimes, quranSurah,
  asmaulHusna, qiblaDirection, translate, shortLink, ipInfo, randomImage, randomQuote, gpt, normalizeDl,
};
