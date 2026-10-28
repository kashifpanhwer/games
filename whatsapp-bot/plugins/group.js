import { config } from '../src/config.js';
import { getGroup, setSetting, addWarn, db } from '../src/database.js';
import { quickReply, interactivePayload, sendInteractive } from '../lib/buttons.js';
import { toJid, getGroupAdmins, sleep } from '../lib/functions.js';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

const grp = { group: true, category: 'Group' };
const adm = { group: true, admin: true, botAdmin: true, category: 'Group' };

export default [
  /* ────────────── group info ────────────── */
  {
    ...grp, name: 'groupinfo', aliases: ['gcinfo', 'infogc'], botAdmin: false, admin: false,
    desc: 'Show detailed information about this group',
    handler: async ({ m, sock }) => {
      const meta = await sock.groupMetadata(m.chat);
      const admins = getGroupAdmins(meta.participants || []);
      const g = getGroup(m.chat);
      const text = [
        `╭───「 👥 *GROUP INFO* 」`,
        `│ *Name*    : ${meta.subject}`,
        `│ *ID*      : ${meta.id}`,
        `│ *Members* : ${meta.size || meta.participants?.length || 0}`,
        `│ *Admins*  : ${admins.length}`,
        `│ *Created* : ${new Date((meta.creation || 0) * 1000).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`,
        `│ *Owner*   : @${String(meta.owner || '').split('@')[0]}`,
        `│`,
        `│ ⚙️ *Bot settings for this group*`,
        `│   welcome   : ${g.welcome ? '🟢 on' : '🔴 off'}`,
        `│   goodbye   : ${g.goodbye ? '🟢 on' : '🔴 off'}`,
        `│   antilink  : ${g.antilink ? '🟢 on' : '🔴 off'}`,
        `│   nsfw      : ${g.nsfw ? '🟢 on' : '🔴 off'}`,
        `│   bot admin : ${m.isBotAdmin ? '✅ yes' : '❌ no'}`,
        `╰──────────────────`,
      ].join('\n');
      const desc = meta.desc ? `\n📜 *Description*\n${meta.desc}` : '';
      return m.reply(text + desc, { mentions: meta.owner ? [meta.owner] : [] });
    },
  },
  {
    ...grp, name: 'linkgroup', aliases: ['linkgc', 'grouplink'], botAdmin: true,
    desc: 'Get the invite link of this group',
    handler: async ({ m, sock }) => {
      const code = await sock.groupInviteCode(m.chat);
      return m.reply(`🔗 https://chat.whatsapp.com/${code}`);
    },
  },
  {
    ...adm, name: 'revoke', aliases: ['resetlink', 'revokelink'],
    desc: 'Reset the group invite link',
    handler: async ({ m, sock }) => {
      const code = await sock.groupRevokeInvite(m.chat);
      return m.reply(`♻️ New invite link:\nhttps://chat.whatsapp.com/${code}`);
    },
  },

  /* ────────────── open / close ────────────── */
  {
    ...adm, name: 'group', aliases: ['grup', 'gc'],
    desc: 'Open or close the group for messages', use: 'open|close',
    handler: async ({ m, sock, args }) => {
      const v = (args[0] || '').toLowerCase();
      if (['open', 'unmute', 'unlock'].includes(v)) { await sock.groupSettingUpdate(m.chat, 'not_announcement'); return m.reply('🔓 Group **opened** — all members can send messages.'); }
      if (['close', 'mute', 'lock'].includes(v)) { await sock.groupSettingUpdate(m.chat, 'announcement'); return m.reply('🔒 Group **closed** — only admins can send messages.'); }
      const payload = interactivePayload({
        text: '🔐 *Group Access*\n\nChoose what to do with this group:',
        title: 'Group Settings',
        buttons: [
          quickReply('group open', '🔓 Open group'),
          quickReply('group close', '🔒 Close group'),
          quickReply('groupinfo', 'ℹ️ Group info'),
        ],
      });
      return sendInteractive(sock, m.chat, payload, `• ${config.prefix}group open\n• ${config.prefix}group close`, { quoted: m });
    },
  },
  {
    ...adm, name: 'setdesc', aliases: ['setdeskripsi', 'setdescription'],
    desc: 'Change the group description', use: '<text>',
    handler: async ({ m, sock, text }) => {
      if (!text) return m.reply('ℹ️ Provide the new description.');
      await sock.groupUpdateDescription(m.chat, text);
      return m.reply('✅ Group description updated.');
    },
  },
  {
    ...adm, name: 'setsubject', aliases: ['setnamegc', 'setgcname'],
    desc: 'Change the group subject/name', use: '<new name>',
    handler: async ({ m, sock, text }) => {
      if (!text) return m.reply('ℹ️ Provide the new group name.');
      await sock.groupUpdateSubject(m.chat, text.slice(0, 100));
      return m.reply(`✅ Group renamed to *${text.slice(0, 100)}*`);
    },
  },
  {
    ...adm, name: 'setppgc', aliases: ['setppgroup'],
    desc: 'Change the group profile picture', media: 'image',
    handler: async ({ m, sock }) => {
      const buf = await m.download();
      await sock.updateProfilePicture(m.chat, buf);
      return m.reply('✅ Group picture updated.');
    },
  },
  {
    ...adm, name: 'ephemeral', aliases: ['disappearing'],
    desc: 'Turn disappearing messages on/off', use: 'on|off',
    handler: async ({ m, sock, args }) => {
      const on = ['on', '1', 'true', 'enable'].includes((args[0] || '').toLowerCase());
      await sock.groupToggleEphemeral(m.chat, on ? 86400 : 0);
      return m.reply(on ? '⏳ Disappearing messages ON (24h).' : '📌 Disappearing messages OFF.');
    },
  },

  /* ────────────── member management ────────────── */
  {
    ...adm, name: 'promote', aliases: ['prom', 'makeadmin'],
    desc: 'Promote a member to admin', use: '@user',
    handler: async ({ m, sock, args }) => {
      const jid = m.mentions[0] || toJid(args[0] || '') || m.quoted?.sender;
      if (!jid) return m.reply('ℹ️ Tag or quote the member to promote.');
      await sock.groupParticipantsUpdate(m.chat, [jid], 'promote');
      return m.reply(`⬆️ @${jid.split('@')[0]} is now an admin.`, { mentions: [jid] });
    },
  },
  {
    ...adm, name: 'demote', aliases: ['dem', 'removeadmin'],
    desc: 'Demote an admin to member', use: '@user',
    handler: async ({ m, sock, args }) => {
      const jid = m.mentions[0] || toJid(args[0] || '') || m.quoted?.sender;
      if (!jid) return m.reply('ℹ️ Tag or quote the admin to demote.');
      await sock.groupParticipantsUpdate(m.chat, [jid], 'demote');
      return m.reply(`⬇️ @${jid.split('@')[0]} is no longer an admin.`, { mentions: [jid] });
    },
  },
  {
    ...adm, name: 'kick', aliases: ['remove', 'banish'],
    desc: 'Remove a member from the group', use: '@user',
    handler: async ({ m, sock, args }) => {
      const jid = m.mentions[0] || toJid(args[0] || '') || m.quoted?.sender;
      if (!jid) return m.reply('ℹ️ Tag or quote the member to kick.');
      if (jidNormalizedUser(jid) === jidNormalizedUser(sock.user?.id || '')) return m.reply('❌ I cannot kick myself.');
      await sock.groupParticipantsUpdate(m.chat, [jid], 'remove');
      return m.reply(`👋 @${jid.split('@')[0]} has been removed from the group.`, { mentions: [jid] });
    },
  },
  {
    ...adm, name: 'add', aliases: ['invite'],
    desc: 'Add a number to the group', use: '923xxxxxxxxx', cooldown: 5,
    handler: async ({ m, sock, args }) => {
      const nums = args.filter((a) => /^[\d+]/.test(a)).map((a) => toJid(a));
      if (!nums.length) return m.reply('ℹ️ Usage: `.add 923145396910` (or reply to a message).');
      const res = await sock.groupParticipantsUpdate(m.chat, nums, 'add');
      const lines = res.map((r) => {
        const n = String(r.jid).split('@')[0];
        const st = { '200': '✅ added', '408': '⏳ left before', '403': '🔒 privacy blocked', '409': '♻️ already in', '500': '⚠️ server error' }[String(r.status)] || `status ${r.status}`;
        return `• +${n} → ${st}`;
      });
      return m.reply(`👥 *Add result*\n${lines.join('\n')}`);
    },
  },

  /* ────────────── tagging ────────────── */
  {
    ...grp, name: 'tagall', aliases: ['all', 'hidetag2'], admin: true, botAdmin: false,
    desc: 'Mention every member of the group', use: '[message]',
    handler: async ({ m, sock, text }) => {
      const meta = await sock.groupMetadata(m.chat);
      const parts = meta.participants || [];
      const list = parts.map((p, i) => `${i + 1}. @${p.id.split('@')[0]}`).join('\n');
      return sock.sendMessage(m.chat, {
        text: `📢 *TAG ALL*\n\n💬 Message: ${text || '(none)'}\n👥 Members: ${parts.length}\n👤 By: @${m.sender.split('@')[0]}\n\n${list}`,
        mentions: parts.map((p) => p.id),
      }, { quoted: m });
    },
  },
  {
    ...grp, name: 'hidetag', aliases: ['ht'], admin: true, botAdmin: false,
    desc: 'Mention everyone without showing the tags', use: '[message]',
    handler: async ({ m, sock, text }) => {
      const meta = await sock.groupMetadata(m.chat);
      const parts = (meta.participants || []).map((p) => p.id);
      return sock.sendMessage(m.chat, { text: text || m.quoted?.text || '📢 Attention everyone!', mentions: parts }, { quoted: m });
    },
  },
  {
    ...grp, name: 'totag', aliases: ['tag'], admin: true, botAdmin: false,
    desc: 'Forward the replied message to all members', quoted: true,
    handler: async ({ m, sock }) => {
      const meta = await sock.groupMetadata(m.chat);
      const parts = (meta.participants || []).map((p) => p.id);
      const q = m.quoted;
      if (q.isMedia) {
        const buf = await q.download();
        const t = (q.mtype || 'imageMessage').replace('Message', '');
        return sock.sendMessage(m.chat, { [t]: buf, caption: q.text || '', mentions: parts }, { quoted: m });
      }
      return sock.sendMessage(m.chat, { text: q.text || '(empty)', mentions: parts }, { quoted: m });
    },
  },

  /* ────────────── moderation ────────────── */
  {
    ...adm, name: 'delete', aliases: ['del', 'd', 'unsend'],
    desc: 'Delete a message sent by the bot', quoted: true,
    handler: async ({ m, sock }) => {
      const q = m.quoted;
      if (!q?.id) return m.reply('ℹ️ Reply to the message you want deleted.');
      return sock.sendMessage(m.chat, {
        delete: { remoteJid: m.chat, fromMe: q.fromMe, id: q.id, participant: q.sender },
      });
    },
  },
  {
    ...grp, name: 'antilink', aliases: ['antilinkgc'], admin: true, botAdmin: true,
    desc: 'Enable/disable WhatsApp-link protection', use: 'on|off',
    handler: async ({ m, sock, args }) => {
      const g = getGroup(m.chat);
      const v = (args[0] || '').toLowerCase();
      if (['on', '1', 'true', 'enable'].includes(v)) { g.antilink = true; return m.reply('🛡️ Anti-link **ON** — WhatsApp links will be deleted and offenders warned.'); }
      if (['off', '0', 'false', 'disable'].includes(v)) { g.antilink = false; return m.reply('🛡️ Anti-link **OFF**.'); }
      const payload = interactivePayload({
        text: `🛡️ *Anti-Link*\n\nStatus: *${g.antilink ? '🟢 ON' : '🔴 OFF'}*\n\nWhen ON, WhatsApp invite links are deleted and the sender receives a strike. 3 strikes = removed.`,
        title: 'Anti-Link',
        buttons: [quickReply('antilink on', g.antilink ? '✅ ON' : '🟢 Turn ON'), quickReply('antilink off', !g.antilink ? '✅ OFF' : '🔴 Turn OFF'), quickReply('groupinfo', 'ℹ️ Group info')],
      });
      return sendInteractive(sock, m.chat, payload, `Anti-link is ${g.antilink ? 'ON' : 'OFF'}\n• ${config.prefix}antilink on\n• ${config.prefix}antilink off`, { quoted: m });
    },
  },
  {
    ...grp, name: 'warn', aliases: ['warning'], admin: true, botAdmin: true,
    desc: 'Warn a member (3 warnings = kick)', use: '@user [reason]',
    handler: async ({ m, sock, args, text }) => {
      const jid = m.mentions[0] || toJid(args[0] || '') || m.quoted?.sender;
      if (!jid) return m.reply('ℹ️ Tag or quote the member to warn.');
      const g = getGroup(m.chat);
      g.strikes = g.strikes || {};
      const n = (g.strikes[jid] = (g.strikes[jid] || 0) + 1);
      const reason = text.replace(/@\d+/g, '').trim() || 'breaking group rules';
      if (n >= 3) {
        await sock.groupParticipantsUpdate(m.chat, [jid], 'remove');
        delete g.strikes[jid];
        return m.reply(`⛔ @${jid.split('@')[0]} reached 3 warnings and was removed.\nReason: ${reason}`, { mentions: [jid] });
      }
      return m.reply(`⚠️ *Warning ${n}/3*\n\n@${jid.split('@')[0]} — ${reason}\n2 more warnings and you will be removed.`, { mentions: [jid] });
    },
  },
  {
    ...grp, name: 'warnings', aliases: ['warnlist'], admin: true, botAdmin: false,
    desc: 'List members who have warnings',
    handler: async ({ m, sock }) => {
      const g = getGroup(m.chat);
      const entries = Object.entries(g.strikes || {});
      if (!entries.length) return m.reply('✅ No warnings issued in this group.');
      return m.reply(`⚠️ *Warnings*\n\n${entries.map(([j, n]) => `• @${j.split('@')[0]} — ${n}/3`).join('\n')}`, { mentions: entries.map(([j]) => j) });
    },
  },
  {
    ...grp, name: 'nsfw', admin: true, botAdmin: false,
    desc: 'Allow NSFW commands in this group', use: 'on|off',
    handler: async ({ m, args }) => {
      const g = getGroup(m.chat);
      const v = (args[0] || '').toLowerCase();
      if (!['on', 'off', '1', '0'].includes(v)) return m.reply(`NSFW is ${g.nsfw ? '🟢 ON' : '🔴 OFF'} here.\nUse \`${config.prefix}nsfw on|off\`.`);
      g.nsfw = ['on', '1'].includes(v);
      return m.reply(`🔞 NSFW is now **${g.nsfw ? 'ON' : 'OFF'}** in this group.`);
    },
  },

  /* ────────────── welcome / goodbye ────────────── */
  {
    ...grp, name: 'welcome', aliases: ['welcomeset'], admin: true, botAdmin: false,
    desc: 'Toggle the welcome message', use: 'on|off',
    handler: async ({ m, sock, args }) => {
      const g = getGroup(m.chat);
      const v = (args[0] || '').toLowerCase();
      if (!['on', 'off', '1', '0'].includes(v)) {
        const payload = interactivePayload({
          text: `👋 *Welcome & Goodbye*\n\nwelcome : ${g.welcome ? '🟢 on' : '🔴 off'}\ngoodbye : ${g.goodbye ? '🟢 on' : '🔴 off'}`,
          title: 'Welcome / Goodbye',
          buttons: [quickReply('welcome on', '🟢 Welcome ON'), quickReply('welcome off', '🔴 Welcome OFF'), quickReply('goodbye on', '🟢 Goodbye ON'), quickReply('goodbye off', '🔴 Goodbye OFF')],
        });
        return sendInteractive(sock, m.chat, payload, `welcome: ${g.welcome}\ngoodbye: ${g.goodbye}`, { quoted: m });
      }
      g.welcome = ['on', '1'].includes(v);
      return m.reply(`👋 Welcome messages are now **${g.welcome ? 'ON' : 'OFF'}**.`);
    },
  },
  {
    ...grp, name: 'goodbye', aliases: ['byeset'], admin: true, botAdmin: false,
    desc: 'Toggle the goodbye message', use: 'on|off',
    handler: async ({ m, args }) => {
      const g = getGroup(m.chat);
      const v = (args[0] || '').toLowerCase();
      if (!['on', 'off', '1', '0'].includes(v)) return m.reply(`Goodbye is ${g.goodbye ? '🟢 ON' : '🔴 OFF'}.\nUse \`${config.prefix}goodbye on|off\`.`);
      g.goodbye = ['on', '1'].includes(v);
      return m.reply(`👋 Goodbye messages are now **${g.goodbye ? 'ON' : 'OFF'}**.`);
    },
  },

  /* ────────────── polls & misc ────────────── */
  {
    ...grp, name: 'poll', aliases: ['vote', 'polling'], botAdmin: false, admin: false,
    desc: 'Create a poll', use: 'Question|Option1|Option2|Option3',
    handler: async ({ m, sock, text }) => {
      const parts = text.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) return m.reply(`ℹ️ Usage: \`${config.prefix}poll Best language?|JavaScript|Python|PHP\``);
      const [question, ...options] = parts;
      return sock.sendMessage(m.chat, { poll: { name: question, values: options.slice(0, 12), selectableCount: 1 } }, { quoted: m });
    },
  },
  {
    ...grp, name: 'listonline', aliases: ['here', 'aktif'], botAdmin: false, admin: false,
    desc: 'Show members seen recently in this group',
    handler: async ({ m, sock }) => {
      const meta = await sock.groupMetadata(m.chat);
      const parts = (meta.participants || []).map((p) => p.id);
      return sock.sendMessage(m.chat, {
        text: `🟢 *${parts.length} members*\n\n${parts.map((p, i) => `${i + 1}. @${p.split('@')[0]}`).join('\n')}`,
        mentions: parts,
      }, { quoted: m });
    },
  },
  {
    ...grp, name: 'simulate', aliases: ['testevent'], admin: true, botAdmin: false,
    desc: 'Test the welcome/goodbye message', use: 'welcome|goodbye',
    handler: async ({ m, sock, args }) => {
      const { handleParticipants } = await import('../src/group-events.js');
      const action = (args[0] || 'welcome').toLowerCase() === 'goodbye' ? 'remove' : 'add';
      await handleParticipants(sock, { id: m.chat, participants: [m.sender], action });
      return m.reply(`✅ Triggered a test **${action}** event.`);
    },
  },
];
