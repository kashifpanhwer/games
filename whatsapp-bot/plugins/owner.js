import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { config } from '../src/config.js';
import { db, setSetting, banUser, getUser } from '../src/database.js';
import { loadPlugins, stats, byCategory } from '../src/plugins.js';
import { quickReply, interactivePayload, sendInteractive } from '../lib/buttons.js';
import { formatBytes, toJid } from '../lib/functions.js';

const own = { owner: true, category: 'Owner' };

export default [
  /* ────────────── owner card ────────────── */
  {
    ...own, name: 'owner', aliases: ['creator', 'mod', 'contact'],
    desc: 'Show the bot owner contact card',
    handler: async ({ m, sock }) => {
      const vcard = [
        'BEGIN:VCARD', 'VERSION:3.0',
        `N:;${config.ownerName};;;`,
        `FN:${config.ownerName}`,
        `ORG:${config.botAuthor};`,
        `TEL;type=CELL;type=VOICE;waid=${config.owners[0]}:+${config.owners[0]}`,
        `NOTE:${config.botName} v${config.versionLabel}`,
        'END:VCARD',
      ].join('\n');
      await sock.sendMessage(m.chat, {
        contacts: { displayName: config.ownerName, contacts: [{ vcard }] },
      }, { quoted: m });
      return sock.sendMessage(m.chat, {
        text: `👑 *${config.ownerName}* — +${config.owners[0]}\n\nMessage me for bot deployment, custom features & support.`,
      }, { quoted: m });
    },
  },

  /* ────────────── broadcast ────────────── */
  {
    ...own, name: 'bc', aliases: ['broadcast', 'bcgc', 'bcgroup'],
    desc: 'Broadcast to every known chat (.bcgc = groups only)',
    use: '<message>', cooldown: 10,
    handler: async ({ m, sock, text, command }) => {
      if (!text && !m.quoted) return m.reply(`ℹ️ Usage: \`${config.prefix}${command} <message>\``);
      const groupsOnly = /bcgc|bcgroup/.test(command);
      const targets = new Set();
      if (db.groups) for (const jid of Object.keys(db.groups)) if (jid.endsWith('@g.us')) targets.add(jid);
      if (!groupsOnly && db.users) {
        for (const jid of Object.keys(db.users)) if (jid.endsWith('@s.whatsapp.net')) targets.add(jid);
      }
      const list = [...targets];
      if (!list.length) return m.reply('ℹ️ No known chats yet. The bot learns chats as people message it.');
      await m.reply(`📡 Broadcasting to *${list.length}* chats — this takes ~${Math.round(list.length * 0.7)}s.`);
      const banner = `╭─「 📢 *${config.botName}* Broadcast 」\n│\n${text}\n│\n╰─ Sent by ${config.ownerName}`;
      let ok = 0;
      for (const jid of list) {
        try {
          if (m.quoted?.isMedia) {
            const buf = await m.quoted.download();
            const t = (m.quoted.mtype || 'imageMessage').replace('Message', '');
            await sock.sendMessage(jid, { [t]: buf, caption: banner });
          } else {
            await sock.sendMessage(jid, { text: banner });
          }
          ok++;
          await new Promise((r) => setTimeout(r, 700));
        } catch { /* skip unreachable chats */ }
      }
      return m.reply(`✅ Broadcast complete — delivered to *${ok}/${list.length}* chats.`);
    },
  },

  /* ────────────── block / unblock ────────────── */
  {
    ...own, name: 'block', aliases: ['blok'],
    desc: 'Block a WhatsApp user', use: '@user',
    handler: async ({ m, sock, args }) => {
      const jid = m.mentions[0] || toJid(args[0] || '') || m.quoted?.sender;
      if (!jid) return m.reply('ℹ️ Tag, quote or type the number to block.');
      await sock.updateBlockStatus(jid, 'block');
      return m.reply(`⛔ Blocked @${jid.split('@')[0]}`, { mentions: [jid] });
    },
  },
  {
    ...own, name: 'unblock', aliases: ['unblok'],
    desc: 'Unblock a WhatsApp user', use: '@user',
    handler: async ({ m, sock, args }) => {
      const jid = m.mentions[0] || toJid(args[0] || '') || m.quoted?.sender;
      if (!jid) return m.reply('ℹ️ Tag, quote or type the number to unblock.');
      await sock.updateBlockStatus(jid, 'unblock');
      return m.reply(`✅ Unblocked @${jid.split('@')[0]}`, { mentions: [jid] });
    },
  },

  /* ────────────── ban / unban ────────────── */
  {
    ...own, name: 'ban', aliases: ['banuser'],
    desc: 'Ban a user from using the bot', use: '@user',
    handler: async ({ m, args }) => {
      const jid = m.mentions[0] || toJid(args[0] || '') || m.quoted?.sender;
      if (!jid) return m.reply('ℹ️ Tag or quote a user to ban.');
      banUser(jid, true);
      return m.reply(`🚫 Banned @${jid.split('@')[0]} from *${config.botName}*.`, { mentions: [jid] });
    },
  },
  {
    ...own, name: 'unban', aliases: ['unbanuser'],
    desc: 'Lift a bot ban', use: '@user',
    handler: async ({ m, args }) => {
      const jid = m.mentions[0] || toJid(args[0] || '') || m.quoted?.sender;
      if (!jid) return m.reply('ℹ️ Tag or quote a user to unban.');
      banUser(jid, false);
      return m.reply(`✅ Unbanned @${jid.split('@')[0]}.`, { mentions: [jid] });
    },
  },
  {
    ...own, name: 'banlist', aliases: ['listban'],
    desc: 'List every banned user',
    handler: async ({ m }) => {
      const banned = Object.entries(db.users || {}).filter(([, u]) => u.banned);
      if (!banned.length) return m.reply('✅ Nobody is banned.');
      return m.reply(`⛔ *Banned users (${banned.length})*\n\n${banned.map(([jid], i) => `${i + 1}. @${jid.split('@')[0]}`).join('\n')}`, { mentions: banned.map(([j]) => j) });
    },
  },

  /* ────────────── join / leave ────────────── */
  {
    ...own, name: 'join', aliases: ['joingc'],
    desc: 'Join a group from its invite link', use: '<chat.whatsapp.com/…>', cooldown: 5,
    handler: async ({ m, sock, args }) => {
      const code = (args[0] || m.text || '').match(/chat\.whatsapp\.com\/([\w-]+)/)?.[1];
      if (!code) return m.reply('ℹ️ Send a valid `https://chat.whatsapp.com/…` invite link.');
      const res = await sock.groupAcceptInvite(code);
      return m.reply(`✅ Joined the group ${res ? `(${res})` : ''}`);
    },
  },
  {
    ...own, name: 'leave', aliases: ['leavegc', 'out'],
    desc: 'Make the bot leave this group', group: true,
    handler: async ({ m, sock }) => {
      await m.reply(`👋 *${config.botName}* is leaving this group. Khuda Hafiz!`);
      return sock.groupLeave(m.chat);
    },
  },

  /* ────────────── mode switch ────────────── */
  {
    ...own, name: 'setmode', aliases: ['mode', 'public', 'private'],
    desc: 'Switch between public and private (self) mode',
    use: 'public|private',
    handler: async ({ m, args }) => {
      const v = (args[0] || '').toLowerCase();
      if (['public', 'on', 'true', '1'].includes(v)) { setSetting('publicMode', true); return m.reply('🌐 Bot is now **PUBLIC** — everyone can use commands.'); }
      if (['private', 'self', 'off', 'false', '0'].includes(v)) { setSetting('publicMode', false); return m.reply('🔒 Bot is now **PRIVATE** — owner only.'); }
      const payload = interactivePayload({
        text: `🎛️ *Bot Mode*\n\nCurrent: *${db.settings.publicMode ? '🌐 Public' : '🔒 Private'}*\n\nPublic  → anyone can use the bot\nPrivate → only the owner can use it`,
        title: 'Bot Mode',
        buttons: [
          quickReply('setmode public', db.settings.publicMode ? '✅ Public' : '🌐 Make Public'),
          quickReply('setmode private', !db.settings.publicMode ? '✅ Private' : '🔒 Make Private'),
          quickReply('menu', '🏠 Main Menu'),
        ],
      });
      return sendInteractive(m.sock || m.conn, m.chat, payload, `Current: ${db.settings.publicMode ? 'Public' : 'Private'}\n• ${config.prefix}setmode public\n• ${config.prefix}setmode private`, { quoted: m });
    },
  },

  /* ────────────── menu style ────────────── */
  {
    ...own, name: 'setmenu', aliases: ['menutype'],
    desc: 'Change the menu style: buttons | carousel | list | text',
    use: 'buttons|carousel|list|text',
    handler: async ({ m, sock, args }) => {
      const allowed = ['buttons', 'carousel', 'list', 'text'];
      const v = (args[0] || '').toLowerCase();
      if (!allowed.includes(v)) {
        const payload = interactivePayload({
          text: `🎛️ *Menu Style*\n\nCurrent: *${db.settings.menuType}*\n\nPick a new one:`,
          title: 'Menu Style',
          buttons: allowed.map((a) => quickReply(`setmenu ${a}`, `${a === db.settings.menuType ? '✅ ' : ''}${a.toUpperCase()}`)),
        });
        return sendInteractive(sock, m.chat, payload, `Current: ${db.settings.menuType}\n${allowed.map((a) => `• ${config.prefix}setmenu ${a}`).join('\n')}`, { quoted: m });
      }
      setSetting('menuType', v);
      return m.reply(`✅ Menu style set to **${v}**. Send \`${config.prefix}menu\` to see it.`);
    },
  },

  /* ────────────── feature toggles ────────────── */
  {
    ...own, name: 'toggle', aliases: ['feature', 'settings'],
    desc: 'Turn bot features on/off', use: 'anticall|antidelete|antiviewonce|welcome|goodbye|autotyping|autoread|nsfw on|off',
    handler: async ({ m, sock, args }) => {
      const map = {
        anticall: 'antiCall', antidelete: 'antiDelete', antiviewonce: 'antiViewOnce',
        welcome: 'welcome', goodbye: 'goodbye', autotyping: 'autoTyping',
        autoread: 'autoRead', nsfw: 'nsfw', antilink: 'antiLink',
      };
      const key = map[(args[0] || '').toLowerCase()];
      if (!key) {
        const rows = Object.entries(db.settings)
          .filter(([k]) => Object.values(map).includes(k))
          .map(([k, v]) => `${v ? '🟢' : '🔴'} ${k} = ${v}`)
          .join('\n');
        const payload = interactivePayload({
          text: `⚙️ *Feature Switches*\n\n${rows}\n\nUsage: \`${config.prefix}toggle <feature> on|off\``,
          title: 'Bot Features',
          buttons: Object.keys(map).slice(0, 6).map((k) => quickReply(`toggle ${k} on`, `🟢 ${k} ON`)),
        });
        return sendInteractive(sock, m.chat, payload, `⚙️ Features\n\n${rows}`, { quoted: m });
      }
      const val = ['on', 'true', '1', 'enable'].includes((args[1] || '').toLowerCase());
      setSetting(key, val);
      return m.reply(`${val ? '🟢' : '🔴'} *${key}* is now **${val ? 'ON' : 'OFF'}**.`);
    },
  },

  /* ────────────── profile ────────────── */
  {
    ...own, name: 'setname', aliases: ['setbotname'],
    desc: 'Change the bot display name', use: '<new name>',
    handler: async ({ m, sock, text }) => {
      if (!text) return m.reply('ℹ️ Provide the new name.');
      await sock.updateProfileName(text.slice(0, 60));
      return m.reply(`✅ Bot name changed to *${text.slice(0, 60)}*`);
    },
  },
  {
    ...own, name: 'setbio', aliases: ['setstatus', 'setabout'],
    desc: 'Change the bot about/status text', use: '<text>',
    handler: async ({ m, sock, text }) => {
      if (!text) return m.reply('ℹ️ Provide the status text.');
      await sock.updateProfileStatus(text.slice(0, 139));
      return m.reply(`✅ Status updated: ${text}`);
    },
  },
  {
    ...own, name: 'setpp', aliases: ['setppbot'],
    desc: 'Change the bot profile picture', media: 'image',
    handler: async ({ m, sock }) => {
      const buffer = await m.download();
      const meJid = String(sock.user?.id || '').replace(/:\d+/, '') + '@s.whatsapp.net';
      await sock.updateProfilePicture(meJid, buffer);
      return m.reply('✅ Profile picture updated.');
    },
  },

  /* ────────────── plugin control ────────────── */
  {
    ...own, name: 'reload', aliases: ['refresh', 'reloadplugins'],
    desc: 'Hot-reload every plugin without restarting the bot',
    handler: async ({ m }) => {
      const r = await loadPlugins();
      const failed = r.failed.length ? `\n\n⚠️ Issues:\n${r.failed.slice(0, 12).map((f) => '• ' + f).join('\n')}` : '';
      return m.reply(`♻️ Plugins reloaded — *${r.count}* active.${failed}`);
    },
  },
  {
    ...own, name: 'pluginlist', aliases: ['plugins'],
    desc: 'List every loaded plugin grouped by category',
    handler: async ({ m }) => {
      const s = stats();
      const lines = [`🧩 *Plugins* — ${s.total} plugins • ${s.commands} triggers • ${s.categories} categories`, ''];
      for (const [cat, list] of byCategory) {
        lines.push(`*${cat}* (${list.length})`);
        list.forEach((p) => lines.push(`  • ${p.name}${p.aliases.length ? ' / ' + p.aliases.join(', ') : ''}`));
        lines.push('');
      }
      return m.reply(lines.join('\n').slice(0, 3800));
    },
  },
  {
    ...own, name: 'restart', aliases: ['reboot'],
    desc: 'Restart the WhatsApp connection',
    handler: async ({ m }) => {
      await m.reply('🔄 Restarting the connection…');
      await new Promise((r) => setTimeout(r, 1200));
      const { restart } = await import('../src/connection.js');
      return restart();
    },
  },
  {
    ...own, name: 'logout', aliases: ['clearsession', 'unpair'],
    desc: 'Delete the session folder and log the bot out',
    handler: async ({ m }) => {
      await m.reply('🗑️ Logging out and deleting the session…');
      const { logout } = await import('../src/connection.js');
      return logout();
    },
  },
  {
    ...own, name: 'shutdown', aliases: ['exit', 'stopbot'],
    desc: 'Stop the bot process completely',
    handler: async ({ m }) => {
      await m.reply('👋 Shutting down…');
      setTimeout(() => process.exit(0), 1200);
    },
  },

  /* ────────────── eval / shell (hidden) ────────────── */
  {
    ...own, name: '>', aliases: ['eval', '=>'], hidden: true,
    desc: 'Evaluate JavaScript inside the bot context', use: '<code>',
    handler: async (ctx) => {
      const { m, sock, args, db } = ctx;
      const code = args.join(' ');
      let out;
      try {
        out = await eval(`(async () => { return (${code}) })()`);
      } catch (e) { out = e; }
      return m.reply('```js\n' + util.inspect(out, { depth: 3 }).slice(0, 3500) + '\n```');
    },
  },
  {
    ...own, name: '$', aliases: ['exec', 'bash'], hidden: true,
    desc: 'Run a shell command on the host', use: '<command>',
    handler: async (ctx) => {
      const { m, args } = ctx;
      const { exec } = await import('node:child_process');
      exec(args.join(' ') || 'echo nothing', { cwd: config.root }, (err, stdout, stderr) => {
        m.reply('```sh\n' + [stdout, stderr, err && err.message].filter(Boolean).join('\n').slice(0, 3500) + '\n```');
      });
    },
  },

  /* ────────────── session info ────────────── */
  {
    ...own, name: 'session', aliases: ['sesinfo'],
    desc: 'Show session folder size and contents',
    handler: async ({ m }) => {
      const dir = config.sessionDir;
      if (!fs.existsSync(dir)) return m.reply('No session folder yet.');
      const files = fs.readdirSync(dir);
      let bytes = 0;
      for (const f of files) { try { bytes += fs.statSync(path.join(dir, f)).size; } catch { /* ignore */ } }
      return m.reply(`📁 *Session*\nPath: \`${dir}\`\nFiles: ${files.length}\nSize: ${formatBytes(bytes)}\n\n${files.slice(0, 25).map((f) => '• ' + f).join('\n')}`);
    },
  },
  {
    ...own, name: 'premium', aliases: ['addprem', 'delprem'],
    desc: 'Grant/remove premium (unlimited commands)', use: 'add|del @user',
    handler: async ({ m, args }) => {
      const act = (args[0] || '').toLowerCase();
      const jid = m.mentions[0] || toJid(args[1] || '') || m.quoted?.sender;
      if (!jid) return m.reply('ℹ️ Usage: `.premium add @user`  /  `.premium del @user`');
      const on = act.startsWith('add');
      getUser(jid).premium = on;
      return m.reply(on ? `💎 Premium granted to @${jid.split('@')[0]}` : `♻️ Premium removed from @${jid.split('@')[0]}`, { mentions: [jid] });
    },
  },
];
