import os from 'node:os';
import { config } from '../src/config.js';
import { db } from '../src/database.js';
import { stats } from '../src/plugins.js';
import { connState } from '../src/state.js';
import { quickReply, interactivePayload, sendInteractive } from '../lib/buttons.js';
import { clockString, formatBytes } from '../lib/functions.js';

export default [
  {
    name: 'ping', aliases: ['p', 'speed', 'latency'], category: 'Info',
    desc: 'Measure the bot response speed',
    handler: async ({ m }) => {
      const t0 = Date.now();
      const sent = await m.reply('🏓 Pinging…');
      const t1 = Date.now();
      const ms = t1 - t0;
      const bar = '█'.repeat(Math.max(1, Math.min(10, Math.round((1000 - ms) / 100))));
      return m.reply(`⚡ *${config.botName}*\n\nResponse: *${ms} ms*\nSpeed: ${bar}\nNode: ${process.version}\nUptime: ${clockString(process.uptime() * 1000)}`);
    },
  },
  {
    name: 'runtime', aliases: ['uptime', 'alive'], category: 'Info',
    desc: 'How long the bot has been running',
    handler: async ({ m }) => {
      const since = connState.connectedAt || connState.startedAt;
      return m.reply(`🕒 *${config.botName}* has been alive for\n\n*${clockString(Date.now() - since)}*\n\nSession mode: ${connState.mode || config.authMode}\nStatus: ${connState.status}`);
    },
  },
  {
    name: 'botinfo', aliases: ['info', 'infobot', 'about'], category: 'Info',
    desc: 'Full bot information & system stats',
    handler: async ({ m, sock }) => {
      const s = stats();
      const mem = process.memoryUsage();
      const text = [
        `╭───「 ⚡ *${config.botName.toUpperCase()}* 」`,
        `│ *Version*  : ${config.versionLabel}`,
        `│ *Library*  : Baileys (Multi-Device)`,
        `│ *Owner*    : ${config.ownerName} (+${config.owners[0]})`,
        `│ *Commands* : ${s.commands} (${s.categories} categories)`,
        `│ *Prefix*   : ${config.prefixLabel}`,
        `│ *Mode*     : ${db.settings.publicMode ? '🌐 Public' : '🔒 Private'}`,
        `│ *Menu*     : ${db.settings.menuType}`,
        `╰────────────────────`,
        '',
        `╭───「 🖥️ *SYSTEM* 」`,
        `│ Platform : ${os.platform()} / ${os.arch()}`,
        `│ Node     : ${process.version}`,
        `│ CPU      : ${os.cpus()?.[0]?.model || 'unknown'} (${os.cpus()?.length || 1} cores)`,
        `│ RAM used : ${formatBytes(mem.heapUsed)} / ${formatBytes(os.totalmem())}`,
        `│ Free RAM : ${formatBytes(os.freemem())}`,
        `│ Uptime   : ${clockString(process.uptime() * 1000)}`,
        `╰────────────────────`,
        '',
        `╭───「 📊 *USAGE* 」`,
        `│ Messages seen : ${connState.messages}`,
        `│ Commands run  : ${db.stats?.commandsUsed || connState.commands}`,
        `│ Users stored  : ${Object.keys(db.users || {}).length}`,
        `│ Groups stored : ${Object.keys(db.groups || {}).length}`,
        `╰────────────────────`,
      ].join('\n');

      const payload = interactivePayload({
        text,
        title: config.botName,
        subtitle: `v${config.versionLabel}`,
        buttons: [
          quickReply('menu', '🏠 Main Menu'),
          quickReply('owner', '👑 Contact Owner'),
          quickReply('script', '📜 Get Script'),
          quickReply('runtime', '🕒 Runtime'),
        ],
      });
      return sendInteractive(sock, m.chat, payload, text, { quoted: m });
    },
  },
  {
    name: 'profile', aliases: ['mylimit', 'me', 'limit'], category: 'Info',
    desc: 'Your personal bot profile & remaining limit',
    handler: async ({ m }) => {
      const u = db.users?.[m.sender] || {};
      return m.reply([
        `╭───「 👤 *YOUR PROFILE* 」`,
        `│ Name      : ${m.pushName || u.name || '—'}`,
        `│ Number    : +${String(m.sender).split('@')[0]}`,
        `│ Role      : ${m.isOwner ? '👑 Owner' : u.premium ? '💎 Premium' : '👤 Free user'}`,
        `│ Limit     : ${config.limitEnabled ? `${u.limit ?? config.limitPerDay}/${config.limitPerDay}` : '♾️ unlimited'}`,
        `│ Commands  : ${u.totalCmd || 0} used`,
        `│ Status    : ${u.banned ? '⛔ BANNED' : '✅ Active'}`,
        `│ Registered: ${u.registered ? new Date(u.registered).toLocaleDateString('en-PK') : '—'}`,
        `╰────────────────────`,
      ].join('\n'));
    },
  },
  {
    name: 'listgc', aliases: ['groups', 'grouplist'], category: 'Info',
    desc: 'List every group the bot is in',
    handler: async ({ m, sock }) => {
      try {
        const groups = await sock.groupFetchAllParticipating();
        const list = Object.values(groups || {});
        if (!list.length) return m.reply('ℹ️ The bot is not in any group yet.');
        return m.reply(`👥 *${list.length} groups*\n\n${list.map((g, i) => `${i + 1}. ${g.subject}\n   ${g.id} • ${g.size || 0} members`).join('\n\n')}`.slice(0, 3800));
      } catch (e) {
        const keys = Object.keys(db.groups || {});
        return m.reply(`👥 *${keys.length} known groups*\n\n${keys.map((k, i) => `${i + 1}. ${k}`).join('\n')}`);
      }
    },
  },
  {
    name: 'listpc', aliases: ['pcs', 'privatelist'], category: 'Info',
    desc: 'List private chats the bot knows',
    handler: async ({ m }) => {
      const pcs = Object.keys(db.users || {}).filter((j) => j.endsWith('@s.whatsapp.net'));
      if (!pcs.length) return m.reply('ℹ️ No private chats recorded yet.');
      return m.reply(`💬 *${pcs.length} private chats*\n\n${pcs.map((j, i) => `${i + 1}. +${j.split('@')[0]}${db.users[j]?.name ? ` — ${db.users[j].name}` : ''}`).join('\n')}`.slice(0, 3800));
    },
  },
  {
    name: 'script', aliases: ['sc', 'source', 'github'], category: 'Info',
    desc: 'Get the bot source-code information',
    handler: async ({ m, sock }) => {
      const text = `📜 *${config.botName}*\n\nVersion : ${config.versionLabel}\nOwner   : ${config.ownerName} (+${config.owners[0]})\nLibrary : @whiskeysockets/baileys\nLanguage: JavaScript (ESM, Node ${process.version})\n\n✨ Features\n• Pairing-code & QR login\n• Button / carousel / list menus\n• Hot-reloadable plugin system\n• ${stats().commands} commands in ${stats().categories} categories\n• Web control panel with live pairing code\n• Anti-link, anti-delete, anti-view-once\n• Group automation & moderation\n\n👑 Contact the owner to deploy your own copy.`;
      const payload = interactivePayload({
        text,
        title: 'Bot Script',
        buttons: [quickReply('owner', '👑 Contact Owner'), quickReply('menu', '🏠 Main Menu'), quickReply('botinfo', 'ℹ️ Bot Info')],
      });
      return sendInteractive(sock, m.chat, payload, text, { quoted: m });
    },
  },
  {
    name: 'rules', aliases: ['tnc', 'terms'], category: 'Info',
    desc: 'Terms & rules for using the bot',
    handler: async ({ m }) => m.reply(
      `📋 *${config.botName} — Rules*\n\n` +
      '1. Do not spam commands — there is a built-in cooldown.\n' +
      '2. Do not use the bot to harass or scam anyone.\n' +
      '3. Do not call the bot number (calls are auto-rejected).\n' +
      '4. Downloaders may fail; the endpoints are public & rate-limited.\n' +
      '5. The bot stores only your number, name and command count.\n' +
      '6. Respect the group admins — the bot obeys their settings.\n\n' +
      'Breaking the rules = ban. Contact the owner to appeal.',
    ),
  },
  {
    name: 'donate', aliases: ['support', 'buymeacoffee'], category: 'Info',
    desc: 'Support the developer',
    handler: async ({ m }) => m.reply(`💝 *Support ${config.botName}*\n\nKeeping the bot online costs time and hosting.\nOwner: ${config.ownerName} (+${config.owners[0]})\n\nJazzCash / EasyPaisa: +${config.owners[0]}\n\nShukriya! 🙏`),
  },
  {
    name: 'state', aliases: ['status', 'connstate'], category: 'Info',
    desc: 'Live connection state of the bot',
    handler: async ({ m }) => m.reply(
      `📡 *Connection State*\n\n` +
      `status      : ${connState.status}\n` +
      `auth mode   : ${connState.mode || config.authMode}\n` +
      `logged in   : ${connState.me ? `+${connState.me.number}` : 'not yet'}\n` +
      `reconnects  : ${connState.reconnects}\n` +
      `last error  : ${connState.lastError || 'none'}\n` +
      `panel       : ${config.panelEnabled ? `http://${config.panelHost}:${config.panelPort}/?token=${config.panelToken}` : 'disabled'}`,
    ),
  },
];
