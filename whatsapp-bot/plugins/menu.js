import { config } from '../src/config.js';
import { db } from '../src/database.js';
import { byCategory, plugins, stats } from '../src/plugins.js';
import { connState } from '../src/state.js';
import {
  interactivePayload,
  carouselPayload,
  sendInteractive,
  quickReply,
  singleSelect,
  urlButton,
  buttonsToText,
} from '../lib/buttons.js';
import { clockString, pickRandom } from '../lib/functions.js';

const MAX_QUICK_BUTTONS = 8; // WhatsApp clients render more than ~9-10 buttons poorly
const GREETINGS = [
  'Assalam-o-Alaikum 🌙',
  'Welcome back ⚡',
  'Ready when you are 🚀',
  'At your service 🤝',
];

const CATEGORY_ICONS = {
  Main: '🏠', Owner: '🧑‍💻', Group: '👥', Downloader: '⬇️', AI: '🤖',
  Tools: '🛠️', Search: '🔎', Fun: '🎮', Islamic: '🕌', Sticker: '🖼️',
  Convert: '🔄', Info: 'ℹ️', Store: '🛒', Anime: '🌸', Others: '📦',
};
const icon = (c) => CATEGORY_ICONS[c] || '📦';

function header() {
  const h = new Date();
  const time = h.toLocaleTimeString('en-PK', { hour12: true, timeZone: 'Asia/Karachi' });
  const date = h.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' });
  return { time, date };
}

function buildBody(m, ctx) {
  const { time, date } = header();
  const s = stats();
  const mode = db.settings.publicMode ? 'Public 🌐' : 'Private 🔒';
  const status = connState.status === 'open' ? 'Online 🟢' : connState.status;
  const runtime = clockString((connState.connectedAt ? Date.now() - connState.connectedAt : process.uptime() * 1000));
  const userCount = Object.keys(db.users || {}).length;
  const groupCount = Object.keys(db.groups || {}).length;
  const name = m.pushName || ctx.getUser(m.sender)?.name || 'User';

  return [
    `╭───「 *${config.botName.toUpperCase()}* 」`,
    `│`,
    `│ 👤 *User*     : ${name}`,
    `│ 📱 *Number*   : +${String(m.sender).split('@')[0]}`,
    `│ ⚡ *Status*   : ${status}`,
    `│ 🕒 *Runtime*  : ${runtime}`,
    `│ 🧩 *Commands* : ${s.commands} in ${s.categories} menus`,
    `│ 👥 *Users*    : ${userCount}  •  *Groups*: ${groupCount}`,
    `│ 💬 *Mode*     : ${mode}`,
    `│ 🌙 *Time*     : ${time} (PKT)`,
    `│ 📅 *Date*     : ${date}`,
    `│`,
    `╰── ${pickRandom(GREETINGS)} — tap a button below 👇`,
  ].join('\n');
}

function categoryButtons() {
  // 'Main' only holds .menu itself, so it would be a self-referential button.
  const cats = [...byCategory.keys()].filter((c) => c !== 'Main').sort((a, b) => {
    const order = ['Main', 'Owner', 'Group', 'Downloader', 'AI', 'Tools', 'Search', 'Fun', 'Islamic', 'Sticker'];
    const ai = order.indexOf(a); const bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const buttons = cats.slice(0, MAX_QUICK_BUTTONS).map((c) =>
    quickReply(`menu:${c}`, `${icon(c)} ${c}`, `${byCategory.get(c).length} commands`),
  );
  return { cats, buttons };
}

function sectionsForSelect() {
  return [...byCategory.entries()].map(([cat, list]) => ({
    title: `${icon(cat)} ${cat}`,
    rows: list.map((p) => ({
      header: cat,
      title: `${config.prefix}${p.name}${p.use ? ' ' + p.use : ''}`,
      description: p.desc,
      id: p.name,
    })),
  }));
}

export default {
  name: 'menu',
  aliases: ['help', 'start', 'list', 'allmenu', 'commands', '?', 'h', 'm'],
  category: 'Main',
  desc: 'Open the Kashif Tech Advance Bot button menu',
  use: '[category|all]',
  cooldown: 3,

  async handler(ctx) {
    const { m, sock, buttonArg, text, args } = ctx;
    const target = (buttonArg || text || args[0] || '').toString().trim().toLowerCase();

    // ── category sub-menu ────────────────────────────────────
    const catKey = [...byCategory.keys()].find((c) => c.toLowerCase() === target);
    if (catKey) return sendCategoryMenu(ctx, catKey);

    // ── everything in one message ────────────────────────────
    if (target === 'all' || target === 'full' || target === 'allmenu') return sendAllMenu(ctx);

    // ── carousel of category cards ───────────────────────────
    if (target === 'carousel' || target === 'cards') return sendCarousel(ctx);

    // ── main menu ────────────────────────────────────────────
    return sendMainMenu(ctx);
  },
};

/* ═══════════════════════ MAIN MENU ═══════════════════════ */

async function sendMainMenu(ctx) {
  const { m, sock } = ctx;
  const { cats, buttons } = categoryButtons();
  const body = buildBody(m, ctx);

  const payload = interactivePayload({
    text: body,
    title: `${config.botName}`,
    subtitle: `v${config.versionLabel} • Button Menu`,
    footer: `© ${config.ownerName} • ${config.botName}\nType ${config.prefix}menu <category> for details`,
    buttons: [
      ...buttons,
      ...(cats.length > MAX_QUICK_BUTTONS
        ? [quickReply('menu:all', '📜 More Categories', `${cats.length - MAX_QUICK_BUTTONS} extra menus`)]
        : []),
    ],
    sections: [{ title: '⚡ All Commands', rows: sectionsForSelect().flatMap((s) => s.rows) }],
  });

  const fallback = `${body}\n\n${cats.map((c) => `*${icon(c)} ${c}*\n${byCategory.get(c).map((p) => `  • ${config.prefix}${p.name}${p.use ? ' ' + p.use : ''} — ${p.desc}`).join('\n')}`).join('\n\n')}`;

  const used = await sendInteractive(sock, m.chat, payload, fallback, { quoted: m });
  if (used === 'text') await m.react('📄').catch(() => {});
  return used;
}

/* ════════════════════ CATEGORY SUB-MENU ════════════════════ */

async function sendCategoryMenu(ctx, cat) {
  const { m, sock } = ctx;
  const list = byCategory.get(cat) || [];
  const body = [
    `╭───「 ${icon(cat)} *${cat.toUpperCase()} MENU* 」`,
    `│ Total : *${list.length}* commands`,
    `│ Bot   : ${config.botName}`,
    `╰────────────────────`,
    '',
    ...list.map((p, i) => {
      const flags = [];
      if (p.owner) flags.push('👑owner');
      if (p.group) flags.push('👥group');
      if (p.admin) flags.push('🛡️admin');
      if (p.botAdmin) flags.push('⬆️bot-admin');
      if (p.media) flags.push(`📎${p.media}`);
      if (p.limit) flags.push(`💎${p.limit} limit`);
      return `*${i + 1}.* ${config.prefix}${p.name}${p.use ? ` _${p.use}_` : ''}\n    ${p.desc}${flags.length ? `\n    \`${flags.join(' · ')}\`` : ''}`;
    }),
  ].join('\n');

  const buttons = list.slice(0, MAX_QUICK_BUTTONS).map((p) =>
    quickReply(p.name, `${config.prefix}${p.name}`, p.desc),
  );
  if (list.length > MAX_QUICK_BUTTONS) {
    buttons.push(singleSelect(`📋 All ${cat} commands`, [{
      title: cat,
      rows: list.map((p) => ({ header: cat, title: `${config.prefix}${p.name}`, description: p.desc, id: p.name })),
    }]));
  }
  buttons.push(quickReply('menu', '🏠 Back to Main Menu', 'Return'));

  const payload = interactivePayload({
    text: body,
    title: `${icon(cat)} ${cat}`,
    subtitle: `${list.length} commands`,
    footer: `© ${config.botAuthor} • ${config.botName}`,
    buttons,
  });

  return sendInteractive(sock, m.chat, payload, body, { quoted: m });
}

/* ══════════════════════ ALL MENU (TEXT) ══════════════════════ */

async function sendAllMenu(ctx) {
  const { m, sock } = ctx;
  const cats = [...byCategory.keys()];
  const out = [
    `╭───「 *${config.botName.toUpperCase()}* 」───`,
    `│ 🧩 ${stats().commands} commands • ${cats.length} categories`,
    `│ 👑 Owner: ${config.ownerName}  •  v${config.versionLabel}`,
    `╰─────────────────────────────`,
    '',
  ];
  for (const c of cats) {
    out.push(`┌─「 ${icon(c)} *${c.toUpperCase()}* 」`);
    for (const p of byCategory.get(c)) {
      out.push(`│ • ${config.prefix}${p.name}${p.use ? ' ' + p.use : ''} — ${p.desc}`);
    }
    out.push('└───────────────');
    out.push('');
  }
  const text = out.join('\n');

  const payload = interactivePayload({
    text,
    title: 'All Commands',
    subtitle: `${stats().commands} commands`,
    buttons: [quickReply('menu', '🏠 Button Menu'), urlButton('https://github.com', '🔗 GitHub')],
    sections: [{ title: '⚡ Jump to a command', rows: sectionsForSelect().flatMap((s) => s.rows) }],
  });

  return sendInteractive(sock, m.chat, payload, text, { quoted: m });
}

/* ═══════════════════════ CAROUSEL ═══════════════════════ */

async function sendCarousel(ctx) {
  const { m, sock } = ctx;
  const cats = [...byCategory.keys()];
  const cards = cats.map((c) => {
    const list = byCategory.get(c);
    return {
      title: `${icon(c)} ${c}`,
      subtitle: `${list.length} commands`,
      text: list.slice(0, 8).map((p, i) => `${i + 1}. ${config.prefix}${p.name} — ${p.desc}`).join('\n') +
        (list.length > 8 ? `\n… +${list.length - 8} more` : ''),
      footer: `© ${config.botAuthor}`,
      buttons: [quickReply(`menu:${c}`, `📂 Open ${c}`)],
    };
  });

  const payload = carouselPayload(cards, {
    text: buildBody(m, ctx),
    footer: `${config.botName} • swipe the cards ➡️`,
  });

  const fallback = buttonsToText(payload) || `${config.botName}\nUse ${config.prefix}menu all`;
  return sendInteractive(sock, m.chat, payload, fallback, { quoted: m });
}
