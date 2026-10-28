import { config } from '../src/config.js';
import { pickRandom } from '../lib/functions.js';
import { quickReply, interactivePayload, sendInteractive } from '../lib/buttons.js';

const fun = { category: 'Fun', limit: 0, cooldown: 3 };

const TRUTHS = [
  'What is the most embarrassing thing you have ever done?',
  'Who in this group would you trust with your phone unlocked?',
  'What is a secret you have never told anyone here?',
  'Have you ever lied about your age? When and why?',
  'What is the last song you cried to?',
  'Which group member would survive longest in a zombie apocalypse?',
  'What is the weirdest thing in your gallery right now?',
  'Have you ever read someone else’s messages without asking?',
  'What is your most irrational fear?',
  'If you could swap lives with one person here, who?',
  'What is the biggest lie you told your parents?',
  'Who was your first crush?',
];

const DARES = [
  'Send a voice note singing the chorus of your favourite song.',
  'Change your WhatsApp status to “I love biryani” for 2 hours.',
  'Send the 5th photo in your gallery without explanation.',
  'Message the last person you talked to: “I have a secret to tell you.”',
  'Write your name with your non-dominant hand and send a photo.',
  'Speak in rhymes for the next 10 messages.',
  'Send a selfie making the funniest face you can.',
  'Call a random contact and wish them Eid Mubarak.',
  'Copy the message of the person above you, exactly.',
  'Send a screenshot of your battery percentage right now.',
];

export default [
  {
    ...fun, name: 'truth', aliases: ['truthq'],
    desc: 'Get a random truth question',
    handler: async ({ m }) => m.reply(`🤫 *TRUTH*\n\n${pickRandom(TRUTHS)}`),
  },
  {
    ...fun, name: 'dare', aliases: ['dareq'],
    desc: 'Get a random dare',
    handler: async ({ m }) => m.reply(`🔥 *DARE*\n\n${pickRandom(DARES)}`),
  },
  {
    ...fun, name: 'dice', aliases: ['roll', 'dado'],
    desc: 'Roll a dice (1-6)',
    handler: async ({ m, sock }) => {
      const n = 1 + Math.floor(Math.random() * 6);
      const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      return sock.sendMessage(m.chat, { sticker: await diceSticker(faces[n - 1]) }, { quoted: m });
    },
  },
  {
    ...fun, name: 'coin', aliases: ['flip', 'toss'],
    desc: 'Flip a coin — heads or tails',
    handler: async ({ m, sock }) => {
      const r = pickRandom(['HEADS 🪙', 'TAILS 🪙']);
      const payload = interactivePayload({
        text: `🪙 *Coin Flip*\n\nResult: *${r}*`,
        title: 'Coin Flip',
        buttons: [quickReply('coin', '🔄 Flip Again'), quickReply('dice', '🎲 Roll Dice')],
      });
      return sendInteractive(sock, m.chat, payload, `🪙 Coin flip → *${r}*`, { quoted: m });
    },
  },
  {
    ...fun, name: '8ball', aliases: ['eightball', 'ask8'],
    desc: 'Ask the magic 8-ball a yes/no question', use: '<question>',
    handler: async ({ m, text }) => {
      if (!text) return m.reply(`ℹ️ Usage: \`${config.prefix}8ball will it rain tomorrow?\``);
      const answers = [
        '✅ Yes — definitely.', '❌ My sources say no.', '🤔 Ask again later.',
        '💯 Without a doubt.', '⚠️ Very doubtful.', '🌟 Signs point to yes.',
        '😶 Better not tell you now.', '👍 As I see it, yes.', '🙅 Don’t count on it.',
        '🔮 Outlook not so good.', '✨ It is certain.', '🤷 Cannot predict now.',
      ];
      return m.reply(`🎱 *Magic 8-Ball*\n\n❓ ${text}\n💬 ${pickRandom(answers)}`);
    },
  },
  {
    ...fun, name: 'ship', aliases: ['love', 'lovecalc', 'match'],
    desc: 'Calculate the love percentage between two people', use: '@user1 @user2',
    handler: async ({ m, sock, args }) => {
      const a = m.mentions[0] || m.sender;
      const b = m.mentions[1] || (m.quoted?.sender) || args.find((x) => /^\d{8,}$/.test(x));
      const second = b ? (b.includes('@') ? b : `${b}@s.whatsapp.net`) : m.sender;
      const seed = [...`${a}${second}`].reduce((s, c) => s + c.codePointAt(0), 0);
      const pct = (seed * 37) % 101;
      const verdict = pct > 85 ? '💘 Made for each other!' : pct > 65 ? '❤️ Strong chemistry!' : pct > 45 ? '💛 Good friends, maybe more…' : pct > 25 ? '💔 Awkward…' : '🧊 Just friends.';
      const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
      return sock.sendMessage(m.chat, {
        text: `💞 *LOVE CALCULATOR*\n\n@${a.split('@')[0]}  ❤️  @${second.split('@')[0]}\n\n${bar}\n*${pct}%*\n\n${verdict}`,
        mentions: [a, second],
      }, { quoted: m });
    },
  },
  {
    ...fun, name: 'joke', aliases: ['funny', 'chuckles'],
    desc: 'A random clean joke',
    handler: async ({ m }) => {
      try {
        const { fetchJson } = await import('../lib/functions.js');
        const j = await fetchJson('https://official-joke-api.appspot.com/random_joke');
        return m.reply(`😂 *Joke*\n\n${j.setup}\n\n… ${j.punchline}`);
      } catch {
        return m.reply(pickRandom([
          '😂 Why do programmers prefer dark mode?\nBecause light attracts bugs.',
          '😂 I told my computer I needed a break…\nNow it won’t stop sending me KitKat ads.',
          '😂 Why was the JavaScript developer sad?\nBecause he didn’t know how to “null” his feelings.',
          '😂 There are 10 kinds of people:\nthose who understand binary and those who don’t.',
        ]));
      }
    },
  },
  {
    ...fun, name: 'quote', aliases: ['motivate', 'inspire'],
    desc: 'A random motivational quote',
    handler: async ({ m }) => {
      const fallback = [
        { content: 'The best way to predict the future is to invent it.', author: 'Alan Kay' },
        { content: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
        { content: 'Do not wait for the perfect moment, take the moment and make it perfect.', author: 'Zoey Sayres' },
        { content: 'Mehnat ka koi shortcut nahi hota.', author: 'Kashif Tech' },
      ];
      try {
        const { fetchJson } = await import('../lib/functions.js');
        const q = await fetchJson('https://api.quotable.io/random');
        return m.reply(`💬 _“${q.content}”_\n\n— *${q.author}*`);
      } catch {
        const q = pickRandom(fallback);
        return m.reply(`💬 _“${q.content}”_\n\n— *${q.author}*`);
      }
    },
  },
  {
    ...fun, name: 'games', aliases: ['game', 'funmenu'],
    desc: 'Open the games & fun button menu',
    handler: async ({ m, sock }) => {
      const payload = interactivePayload({
        text: '🎮 *FUN & GAMES*\n\nPick a game to play 👇',
        title: 'Fun Menu',
        subtitle: config.botName,
        buttons: [
          quickReply('truth', '🤫 Truth'),
          quickReply('dare', '🔥 Dare'),
          quickReply('dice', '🎲 Dice'),
          quickReply('coin', '🪙 Coin Flip'),
          quickReply('ship', '💞 Love Calc'),
          quickReply('joke', '😂 Joke'),
          quickReply('quote', '💬 Quote'),
          quickReply('menu', '🏠 Main Menu'),
        ],
      });
      return sendInteractive(sock, m.chat, payload, '🎮 Fun:\n• .truth\n• .dare\n• .dice\n• .coin\n• .ship @user\n• .joke\n• .quote', { quoted: m });
    },
  },
];

async function diceSticker(face) {
  const { textToImage } = await import('../lib/converter.js');
  const png = await textToImage(face, { bg: 'white', fg: 'black', size: 220 });
  const { imageToWebp } = await import('../lib/converter.js');
  return imageToWebp(png);
}
