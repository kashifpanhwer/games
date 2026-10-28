import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

/** Normalise a phone number to WhatsApp's digits-only format. */
export function normalizeNumber(input = '') {
  let n = String(input).replace(/[^\d]/g, '');
  if (!n) return '';
  // 0300... (local Pakistani format) -> 92300...
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0') && n.length >= 10 && n.length <= 12) n = '92' + n.slice(1);
  return n;
}

const bool = (v, d = false) => {
  if (v === undefined || v === '' || v === null) return d;
  return ['1', 'true', 'yes', 'on', 'y'].includes(String(v).trim().toLowerCase());
};
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => normalizeNumber(s.trim()))
    .filter(Boolean);

export const config = {
  root: ROOT,

  botName: process.env.BOT_NAME || 'Kashif Tech Advance Bot',
  botAuthor: process.env.BOT_AUTHOR || 'Kashif Tech',
  packName: process.env.PACK_NAME || 'Kashif Tech',
  packPublisher: process.env.PACK_PUBLISHER || 'Kashif Tech Advance Bot',
  versionLabel: '2.0.0',

  // ---- auth ----
  pairingNumber: normalizeNumber(process.env.PAIRING_NUMBER || '923145396910'),
  customPairingCode: (process.env.CUSTOM_PAIRING_CODE || '').trim().toUpperCase(),
  authMode: (process.env.AUTH_MODE || 'pair').toLowerCase(),
  sessionDir: path.isAbsolute(process.env.SESSION_DIR || '')
    ? process.env.SESSION_DIR
    : path.resolve(ROOT, process.env.SESSION_DIR || './sessions'),

  owners: list(process.env.OWNER_NUMBER || '923145396910'),
  ownerName: process.env.OWNER_NAME || 'Kashif',
  ownerJid: `${normalizeNumber(process.env.OWNER_NUMBER || '923145396910')}@s.whatsapp.net`,

  // ---- panel ----
  panelEnabled: bool(process.env.PANEL_ENABLED, true),
  panelHost: process.env.PANEL_HOST || '0.0.0.0',
  panelPort: int(process.env.PANEL_PORT, 3000),
  panelToken: process.env.PANEL_TOKEN || 'kashiftech',

  // ---- menu ----
  menuType: (process.env.MENU_TYPE || 'buttons').toLowerCase(),

  // ---- command parsing ----
  prefix: process.env.PREFIX || '.',
  multiPrefix: bool(process.env.MULTI_PREFIX, true),
  prefixes: [],

  // ---- features ----
  features: {
    antiLink: bool(process.env.ANTI_LINK, false),
    antiViewOnce: bool(process.env.ANTI_VIEWONCE, true),
    antiDelete: bool(process.env.ANTI_DELETE, false),
    welcome: bool(process.env.WELCOME, true),
    goodbye: bool(process.env.GOODBYE, true),
    autoTyping: bool(process.env.AUTO_TYPING, true),
    autoRead: bool(process.env.AUTO_READ, false),
    nsfw: bool(process.env.NSFW, false),
    publicMode: bool(process.env.PUBLIC_MODE, true),
  },

  // ---- apis ----
  geminiKey: process.env.GEMINI_API_KEY || '',
  openaiKey: process.env.OPENAI_API_KEY || '',
  shotToken: process.env.SHOTTOKEN || '',
  uploadHost: process.env.UPLOAD_HOST || 'https://tmpfiles.org/api/v1/upload',
  ytApi: process.env.YT_API || '',

  // ---- limits ----
  limitEnabled: bool(process.env.LIMIT_ENABLED, true),
  limitPerDay: int(process.env.LIMIT_PER_DAY, 100),
  cooldown: int(process.env.COOLDOWN_SECONDS, 2),

  startedAt: Date.now(),
};

if (config.multiPrefix) config.prefixes = ['.', '/', '!', '#', '?', '+'];
else config.prefixes = [config.prefix];

/** Owner-only single-character triggers (eval / shell) are not normal prefixes. */
config.specialPrefixes = { '>': '>', $: '$' };

/** Human-readable list of active prefixes for the menu header. */
config.prefixLabel = config.multiPrefix ? '. / ! # ?' : config.prefix;

export default config;
