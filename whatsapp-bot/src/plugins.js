import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';

/**
 * Plugin registry.
 *
 * A plugin is any .js file inside ./plugins that default-exports:
 * {
 *   name:     string,        // primary command
 *   aliases:  string[],      // alternative triggers
 *   category: string,        // menu section
 *   desc:     string,        // one-line help text
 *   use:      string,        // argument hint, e.g. '<url>'
 *   owner:    boolean,       // owner only
 *   group:    boolean,       // group only
 *   admin:    boolean,       // group admin only
 *   botAdmin: boolean,       // bot must be admin
 *   private:  boolean,       // DM only
 *   media:    null|'image'|'video'|'audio'|'sticker'|'document'|'quotedMedia',
 *   limit:    number,        // limit cost (0 = free)
 *   cooldown: number,        // seconds
 *   disabled: boolean,
 *   handler(ctx): Promise<void>
 * }
 */
export const plugins = new Map();       // primary name -> plugin
export const commandMap = new Map();    // every alias -> primary name
export const byCategory = new Map();    // category -> [plugin]

const cooldowns = new Map();            // `${jid}:${cmd}` -> timestamp

export const PLUGIN_DIR = path.join(config.root, 'plugins');

export async function loadPlugins(dir = PLUGIN_DIR, { silent = false } = {}) {
  plugins.clear();
  commandMap.clear();
  byCategory.clear();

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const files = walk(dir).filter((f) => f.endsWith('.js'));
  const loaded = [];
  const failed = [];

  for (const file of files) {
    const rel = path.relative(config.root, file);
    try {
      const mod = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
      const raw = mod.default || mod;
      // A plugin file may export ONE plugin object or an ARRAY of plugins.
      if (!raw) { failed.push(`${rel} (empty export)`); continue; }
      const list = Array.isArray(raw) ? raw : [raw];
      for (const p of list) {
        const r = registerPlugin(p, file, failed);
        if (r) loaded.push(r);
      }
    } catch (err) {
      failed.push(`${rel} → ${err.message}`);
    }
  }

  if (!silent) {
    console.log(`[plugins] ${plugins.size} loaded from ./plugins`);
    for (const f of failed) console.error(`[plugins] FAILED: ${f}`);
  }
  return { loaded, failed, count: plugins.size };
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Normalise + register a single plugin object. Returns a log line or null. */
function registerPlugin(p, file, failed) {
  if (!p || typeof p !== 'object' || typeof p.handler !== 'function') {
    failed.push(`${path.relative(config.root, file)} → missing handler()`);
    return null;
  }
  p.name = p.name || path.basename(file, '.js');
  p.aliases = Array.isArray(p.aliases) ? p.aliases : [];
  p.category = p.category || 'Others';
  p.desc = p.desc || '—';
  p.use = p.use || '';
  p.limit = p.limit ?? 0;
  // COOLDOWN_SECONDS=0 in .env is a global "no throttling" switch (handy for tests)
  p.cooldown = config.cooldown === 0 ? 0 : (p.cooldown ?? config.cooldown);
  p.owner = !!p.owner;
  p.group = !!p.group;
  p.admin = !!p.admin;
  p.botAdmin = !!p.botAdmin;
  p.private = !!p.private;
  p.nsfw = !!p.nsfw;
  p.disabled = !!p.disabled;
  p.media = p.media || null;
  p.file = file;
  p.hidden = !!p.hidden;

  if (p.disabled) return `⊘ ${p.name} (disabled)`;

  if (plugins.has(p.name)) {
    failed.push(`duplicate plugin name "${p.name}" in ${path.relative(config.root, file)}`);
    return null;
  }
  plugins.set(p.name, p);

  for (const t of [p.name, ...p.aliases]) {
    const key = String(t).toLowerCase();
    if (commandMap.has(key)) {
      failed.push(`duplicate trigger "${key}" (${commandMap.get(key)} vs ${p.name}) — skipped`);
      continue;
    }
    commandMap.set(key, p.name);
  }
  if (!p.hidden) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category).push(p);
  }
  return `✔ ${p.name}${p.aliases.length ? ` (${p.aliases.join(', ')})` : ''}`;
}

export function resolveCommand(trigger) {
  if (!trigger) return null;
  const name = commandMap.get(String(trigger).toLowerCase());
  return name ? plugins.get(name) : null;
}

/** Returns {ok, reason} when a command is temporarily blocked. */
export function checkCooldown(plugin, jid) {
  const key = `${jid}:${plugin.name}`;
  const now = Date.now();
  const until = cooldowns.get(key) || 0;
  if (now < until) return { ok: false, wait: Math.ceil((until - now) / 1000) };
  if (plugin.cooldown > 0) cooldowns.set(key, now + plugin.cooldown * 1000);
  return { ok: true };
}

export const stats = () => ({
  total: plugins.size,
  commands: commandMap.size,
  categories: byCategory.size,
});

export default { plugins, commandMap, byCategory, loadPlugins, resolveCommand, checkCooldown, stats };
