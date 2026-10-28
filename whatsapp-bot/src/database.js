import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const DB_FILE = path.join(config.sessionDir, 'database.json');

const DEFAULT_DB = {
  settings: {
    publicMode: config.features.publicMode,
    antiLink: config.features.antiLink,
    antiViewOnce: config.features.antiViewOnce,
    antiDelete: config.features.antiDelete,
    welcome: config.features.welcome,
    goodbye: config.features.goodbye,
    autoTyping: config.features.autoTyping,
    autoRead: config.features.autoRead,
    nsfw: config.features.nsfw,
    antiCall: false,
    menuType: config.menuType,
    premiumOnly: false,
  },
  users: {},   // jid -> { name, limit, premium, banned, warns, lastReset, totalCmd, lastCmd }
  groups: {},  // jid -> { welcome, goodbye, antilink, nsfw, muted, mods[] }
  stats: { commandsUsed: 0, messagesSeen: 0, uptimeStart: Date.now() },
  history: [], // last 50 commands [{cmd, jid, t}]
};

function ensureDir() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

function deepMerge(base, incoming) {
  if (typeof base !== 'object' || base === null) return incoming === undefined ? base : incoming;
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
  const out = { ...base };
  for (const k of Object.keys(incoming || {})) {
    out[k] = k in base ? deepMerge(base[k], incoming[k]) : incoming[k];
  }
  return out;
}

let cache = structuredClone(DEFAULT_DB);
let loaded = false;
let writeTimer = null;

export function load() {
  ensureDir();
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      cache = deepMerge(structuredClone(DEFAULT_DB), JSON.parse(raw));
    }
  } catch (err) {
    const backup = `${DB_FILE}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(DB_FILE, backup); } catch { /* ignore */ }
    cache = structuredClone(DEFAULT_DB);
    console.error(`[db] could not read database, starting fresh (${err.message}). Old file kept at ${backup}`);
  }
  loaded = true;
  return cache;
}

/** Debounced write — safe to call on every mutation. */
export function save() {
  if (!loaded) load();
  ensureDir();
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      const tmp = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error('[db] save failed:', err.message);
    }
  }, 250);
}

export function flush() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  ensureDir();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[db] flush failed:', err.message);
  }
}

export const db = new Proxy(
  {},
  {
    get(_t, prop) {
      if (!loaded) load();
      return cache[prop];
    },
    set(_t, prop, value) {
      if (!loaded) load();
      cache[prop] = value;
      save();
      return true;
    },
    has(_t, prop) {
      if (!loaded) load();
      return prop in cache;
    },
  },
);

// ----------------------- user helpers -----------------------
/** Wrap an object so every mutation is persisted automatically. */
function autoSave(obj) {
  return new Proxy(obj, {
    set(t, k, v) {
      t[k] = v;
      save();
      return true;
    },
    deleteProperty(t, k) {
      delete t[k];
      save();
      return true;
    },
  });
}

export function getUser(jid, name = '') {
  if (!loaded) load();
  if (!cache.users[jid]) {
    cache.users[jid] = {
      name: name || '',
      limit: config.limitPerDay,
      premium: false,
      banned: false,
      warns: 0,
      totalCmd: 0,
      lastCmd: 0,
      lastReset: new Date().toDateString(),
      registered: Date.now(),
    };
    save();
  }
  const u = cache.users[jid];
  if (name && u.name !== name) { u.name = name; save(); }
  // daily limit reset
  const today = new Date().toDateString();
  if (u.lastReset !== today) {
    u.lastReset = today;
    u.limit = config.limitPerDay;
    save();
  }
  return autoSave(u);
}

export const isBanned = (jid) => { if (!loaded) load(); return !!cache.users[jid]?.banned; };
export const banUser = (jid, v = true) => { getUser(jid).banned = v; };
export const addWarn = (jid) => { const u = getUser(jid); u.warns += 1; return u.warns; };
export const useLimit = (jid, n = 1) => { const u = getUser(jid); u.limit = Math.max(0, u.limit - n); };
export const hasLimit = (jid) => !config.limitEnabled || getUser(jid).premium || getUser(jid).limit > 0;
export const bumpCommand = (jid) => { const u = getUser(jid); u.totalCmd += 1; u.lastCmd = Date.now(); };

// ----------------------- group helpers ----------------------
export function getGroup(jid) {
  if (!loaded) load();
  if (!cache.groups[jid]) {
    cache.groups[jid] = {
      welcome: cache.settings.welcome,
      goodbye: cache.settings.goodbye,
      antilink: cache.settings.antiLink,
      nsfw: cache.settings.nsfw,
      muted: false,
      mods: [],
      strikes: {},
      joined: Date.now(),
    };
    save();
  }
  return autoSave(cache.groups[jid]);
}

// ----------------------- settings ---------------------------
export function setSetting(key, value) {
  if (!loaded) load();
  cache.settings[key] = value;
  save();
  return cache.settings[key];
}

// ----------------------- stats ------------------------------
export function recordCommand(cmd, jid) {
  if (!loaded) load();
  cache.stats.commandsUsed += 1;
  cache.history.unshift({ cmd, jid, t: Date.now() });
  if (cache.history.length > 50) cache.history.length = 50;
  save();
}

export default { load, save, flush, db, getUser, getGroup, setSetting, recordCommand, isBanned, banUser, hasLimit, useLimit, bumpCommand, addWarn };
