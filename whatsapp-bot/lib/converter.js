import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { config } from '../src/config.js';

ffmpeg.setFfmpegPath(ffmpegPath.path);

const TMP = path.join(config.root, 'tmp');
fs.mkdirSync(TMP, { recursive: true });

const tmp = (ext) => path.join(TMP, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`);

function run(args, input, output, inputArgs = []) {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();
    if (inputArgs.length) cmd = cmd.input(input).inputOptions(inputArgs);
    else cmd = cmd.input(input);
    cmd
      .outputOptions(args)
      .on('end', () => resolve(output))
      .on('error', reject)
      .save(output);
  });
}

/* ────────────────────────── EXIF for stickers ────────────────────────── */

function buildExifChunkData(packname, author, emojis = []) {
  const json = {
    'sticker-pack-id': `kashiftech.${crypto.randomBytes(4).toString('hex')}`,
    'sticker-pack-name': packname || config.packName,
    'sticker-pack-publisher': author || config.packPublisher,
    'android-app-store-link': '',
    'ios-app-store-link': '',
    emojis,
  };
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
  header.writeUInt32LE(jsonBuff.length, 14);
  return Buffer.concat([header, jsonBuff]);
}

function parseRiffChunks(buf) {
  if (buf.slice(0, 4).toString() !== 'RIFF') throw new Error('not a RIFF/webp file');
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const fourcc = buf.slice(offset, offset + 4).toString('latin1');
    const size = buf.readUInt32LE(offset + 4);
    const data = buf.slice(offset + 8, offset + 8 + size);
    chunks.push({ fourcc, data });
    offset += 8 + size + (size % 2 === 1 ? 1 : 0);
  }
  return chunks;
}

function buildRiff(chunks) {
  const parts = [Buffer.from('WEBP')];
  for (const c of chunks) {
    const head = Buffer.alloc(8);
    head.write(c.fourcc, 0, 'latin1');
    head.writeUInt32LE(c.data.length, 4);
    parts.push(head, c.data);
    if (c.data.length % 2 === 1) parts.push(Buffer.from([0x00]));
  }
  const body = Buffer.concat(parts);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(body.length, 4);
  riff.write('WEBP', 8, 'latin1');
  return Buffer.concat([riff, body.slice(4)]);
}

/** Inject/replace the sticker-pack EXIF metadata of a WebP buffer. */
export function addExif(webp, packname = config.packName, author = config.packPublisher, emojis = []) {
  try {
    const chunks = parseRiffChunks(webp).filter((c) => c.fourcc !== 'EXIF');
    chunks.push({ fourcc: 'EXIF', data: buildExifChunkData(packname, author, emojis) });
    return buildRiff(chunks);
  } catch (err) {
    return webp; // return untouched rather than failing the whole command
  }
}

/* ────────────────────────── conversions ────────────────────────── */

/** WhatsApp stickers are 512×512 with transparent padding. */
const STICKER_SCALE = 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:-1:-1:color=white@0.0';

/** Animated WebP needs a generated palette; must run as a complex filtergraph. */
const ANIM_FILTER =
  `[0:v]${STICKER_SCALE.replace(',format=rgba', '')},split=2[a][b];` +
  '[a]palettegen=reserve_transparent=1:transparency_color=ffffff[p];' +
  '[b][p]paletteuse[v]';

export async function imageToWebp(buffer) {
  const input = tmp('png');
  const output = tmp('webp');
  fs.writeFileSync(input, buffer);
  try {
    await run(['-vf', STICKER_SCALE, '-loop', '0', '-an', '-vsync', '0', '-y'], input, output);
    return addExif(fs.readFileSync(output));
  } finally {
    fs.rmSync(input, { force: true });
    fs.rmSync(output, { force: true });
  }
}

export async function videoToWebp(buffer, seconds = 8) {
  const input = tmp('mp4');
  const output = tmp('webp');
  fs.writeFileSync(input, buffer);
  try {
    await run(
      ['-filter_complex', ANIM_FILTER, '-map', '[v]', '-t', String(seconds),
       '-loop', '0', '-preset', 'default', '-an', '-vsync', '0', '-y'],
      input,
      output,
    );
    return addExif(fs.readFileSync(output));
  } finally {
    fs.rmSync(input, { force: true });
    fs.rmSync(output, { force: true });
  }
}

export async function webpToMp4(buffer) {
  const input = tmp('webp');
  const output = tmp('mp4');
  fs.writeFileSync(input, buffer);
  try {
    await run(
      [
        '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'ultrafast',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-movflags', '+faststart', '-y',
      ],
      input,
      output,
    );
    return fs.readFileSync(output);
  } finally {
    fs.rmSync(input, { force: true });
    fs.rmSync(output, { force: true });
  }
}

export async function toAudio(buffer, ext = 'mp4', target = 'mp3') {
  const input = tmp(ext);
  const output = tmp(target);
  fs.writeFileSync(input, buffer);
  try {
    await run(['-vn', '-ac', '2', '-b:a', '128k', '-ar', '44100', '-f', target, '-y'], input, output);
    return fs.readFileSync(output);
  } finally {
    fs.rmSync(input, { force: true });
    fs.rmSync(output, { force: true });
  }
}

/** Render text into a sticker-style PNG via ffmpeg's drawtext. */
export async function textToImage(text, { bg = 'black', fg = 'white', size = 96, width = 720, height = 720 } = {}) {
  const output = tmp('png');
  const safe = String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\u2019")
    .replace(/([:%,])/g, '\\$1')
    .replace(/\n/g, ' ')
    .slice(0, 120);

  // Auto-shrink the font so long text still fits inside the square canvas.
  const approx = Math.max(28, Math.min(size, Math.floor((width * 1.6) / Math.max(safe.length, 6))));

  const inputArgs = ['-f', 'lavfi'];
  const input = `color=c=${bg}:s=${width}x${height}:d=1:r=1`;

  try {
    await run(
      ['-vf', `drawtext=text='${safe}':fontcolor=${fg}:fontsize=${approx}:x=(w-text_w)/2:y=(h-text_h)/2`, '-frames:v', '1', '-y'],
      input,
      output,
      inputArgs,
    );
  } catch {
    // drawtext can be missing in minimal builds — fall back to a plain canvas
    await run(['-frames:v', '1', '-y'], input, output, inputArgs);
  }

  const buf = fs.readFileSync(output);
  fs.rmSync(output, { force: true });
  return buf;
}

export { ffmpeg, TMP, tmp };
export default { imageToWebp, videoToWebp, webpToMp4, toAudio, addExif, textToImage, tmp, TMP };
