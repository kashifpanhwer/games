import { config } from './config.js';
import { getGroup, db } from './database.js';
import { pushLog } from './state.js';
import { sleep } from '../lib/functions.js';

/**
 * Welcome / Goodbye / Promote / Demote group events.
 */
const pic = (jid) => `https://pps.whatsapp.net/api/preview/${String(jid).split('@')[0] || ''}`;

export async function handleParticipants(sock, { id, participants, action }) {
  const g = getGroup(id);
  let subject = '';
  try {
    const meta = await sock.groupMetadata(id);
    subject = meta?.subject || 'this group';
  } catch { subject = 'this group'; }

  for (const p of participants) {
    const num = p.split('@')[0];
    if (action === 'add' && g.welcome !== false) {
      const text =
        `👋 *Welcome to ${subject}*\n\n` +
        `@${num}\n\n` +
        `📜 Please read the group description and stay respectful.\n` +
        `⚡ Powered by *${config.botName}*`;
      await sendWithImage(sock, id, text, p);
    }
    if (action === 'remove' && g.goodbye !== false) {
      const text = `👋 *Goodbye* @${num}\nThanks for being part of *${subject}*.\n\n⚡ ${config.botName}`;
      await sendWithImage(sock, id, text, p);
    }
    if (action === 'promote') {
      await sock.sendMessage(id, { text: `🎉 Congratulations @${num} — you are now an *admin* of ${subject}!`, mentions: [p] }).catch(() => {});
    }
    if (action === 'demote') {
      await sock.sendMessage(id, { text: `⬇️ @${num} is no longer an admin of ${subject}.`, mentions: [p] }).catch(() => {});
    }
    await sleep(400);
  }
}

async function sendWithImage(sock, jid, text, participant) {
  try {
    await sock.sendMessage(jid, {
      image: { url: pic(participant) },
      caption: text,
      mentions: [participant],
    });
  } catch {
    await sock.sendMessage(jid, { text, mentions: [participant] }).catch(() => {});
  }
}

export default { handleParticipants };
