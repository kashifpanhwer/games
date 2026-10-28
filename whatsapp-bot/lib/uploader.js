import axios from 'axios';
import FormData from 'form-data';
import crypto from 'node:crypto';
import { config } from '../src/config.js';

/**
 * Anonymous media hosts. Providers are tried in order until one succeeds,
 * so a single dead endpoint never breaks `.tourl` / sticker uploads.
 */

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function tmpfiles(buffer, ext = 'jpg') {
  const form = new FormData();
  form.append('file', buffer, { filename: `ktb_${Date.now()}.${ext}`, contentType: guessMime(ext) });
  const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
    headers: { ...form.getHeaders(), 'User-Agent': UA },
    maxBodyLength: Infinity,
    timeout: 60000,
  });
  const url = res.data?.data?.url;
  if (!url) throw new Error('tmpfiles: unexpected response');
  return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

async function catbox(buffer, ext = 'jpg') {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buffer, { filename: `ktb_${Date.now()}.${ext}`, contentType: guessMime(ext) });
  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: { ...form.getHeaders(), 'User-Agent': UA },
    maxBodyLength: Infinity,
    timeout: 60000,
  });
  if (!/^https:\/\//.test(String(res.data))) throw new Error('catbox: unexpected response');
  return String(res.data).trim();
}

async function uguu(buffer, ext = 'jpg') {
  const form = new FormData();
  form.append('files[]', buffer, { filename: `ktb_${Date.now()}.${ext}`, contentType: guessMime(ext) });
  const res = await axios.post('https://uguu.se/upload.php', form, {
    headers: { ...form.getHeaders(), 'User-Agent': UA },
    maxBodyLength: Infinity,
    timeout: 60000,
  });
  const url = res.data?.files?.[0]?.url;
  if (!url) throw new Error('uguu: unexpected response');
  return url;
}

const PROVIDERS = [
  { name: 'tmpfiles.org', fn: tmpfiles, ttl: '1 hour' },
  { name: 'catbox.moe', fn: catbox, ttl: 'permanent' },
  { name: 'uguu.se', fn: uguu, ttl: '3 hours' },
];

function guessMime(ext) {
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', pdf: 'application/pdf', txt: 'text/plain' };
  return map[ext] || 'application/octet-stream';
}

/**
 * Upload a buffer and return { url, provider, ttl }.
 * @param {Buffer} buffer
 * @param {string} ext
 */
export async function uploadBuffer(buffer, ext = 'jpg') {
  const errors = [];
  for (const p of PROVIDERS) {
    try {
      const url = await p.fn(buffer, ext);
      return { url, provider: p.name, ttl: p.ttl, size: buffer.length };
    } catch (err) {
      errors.push(`${p.name}: ${err.message}`);
    }
  }
  throw new Error(`All upload providers failed → ${errors.join(' | ')}`);
}

/** Upload from a URL (downloads first). */
export async function uploadUrl(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, headers: { 'User-Agent': UA } });
  const ext = (url.split('?')[0].split('.').pop() || 'jpg').slice(0, 5).toLowerCase();
  return uploadBuffer(Buffer.from(res.data), ext);
}

export { PROVIDERS };
export default { uploadBuffer, uploadUrl, PROVIDERS };
