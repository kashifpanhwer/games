#!/usr/bin/env node
/**
 * Wipe the stored WhatsApp session (creds + keys) and the JSON database.
 *
 *   node scripts/clean-session.js           # remove creds only, keep the database
 *   node scripts/clean-session.js --all     # remove creds AND the database
 *
 * Use this when the bot says "Session logged out" or refuses to re-pair.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

const all = process.argv.includes('--all');
const dir = config.sessionDir;

if (!fs.existsSync(dir)) {
  console.log(`Nothing to clean — ${dir} does not exist.`);
  process.exit(0);
}

let removed = 0;
for (const entry of fs.readdirSync(dir)) {
  const full = path.join(dir, entry);
  const isDb = /database\.json/.test(entry);
  if (isDb && !all) {
    console.log(`  kept    ${entry}  (use --all to remove the database too)`);
    continue;
  }
  fs.rmSync(full, { recursive: true, force: true });
  removed++;
  console.log(`  removed ${entry}`);
}

console.log(`\n✅ Cleaned ${removed} item(s) from ${dir}`);
console.log('Run `npm run pair` to link the bot again.');
