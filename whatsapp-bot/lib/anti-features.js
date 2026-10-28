import { downloadMedia } from './functions.js';
import { config } from '../src/config.js';
import { getGroup } from '../src/database.js';

/**
 * Group/chat protection helpers:
 *  • antiViewOnce  — re-send view-once media as a normal message
 *  • deleteLinkMessage — anti-link (delete + warn + optional kick)
 *  • restoreDeleted — anti-delete
 */

const EXT = {
  imageMessage: 'jpg',
  videoMessage: 'mp4',
  audioMessage: 'mp3',
  stickerMessage: 'webp',
  documentMessage: 'bin',
};

export async function antiViewOnce(sock, m) {
  const inner = m.message?.viewOnceMessageV2?.message || m.message?.viewOnceMessage?.message || m.message;
  if (!inner) return;
  const types = ['imageMessage', 'videoMessage', 'audioMessage'];
  const type = types.find((t) => inner[t]);
  if (!type) return;

  const node = inner[type];
  const buffer = await downloadMedia(sock, inner, false);
  const caption = node.caption || '';
  const header = `👁️ *View-Once Bypassed*\n👤 Sender: @${m.sender.split('@')[0]}\n${caption ? `💬 Caption: ${caption}` : ''}`.trim();

  const mentions = [m.sender];
  if (type === 'imageMessage') {
    await sock.sendMessage(m.chat, { image: buffer, caption: header, mentions }, { quoted: m });
  } else if (type === 'videoMessage') {
    await sock.sendMessage(m.chat, { video: buffer, caption: header, mentions }, { quoted: m });
  } else {
    await sock.sendMessage(m.chat, { audio: buffer, mimetype: node.mimetype || 'audio/mp4', ptt: !!node.ptt }, { quoted: m });
    await sock.sendMessage(m.chat, { text: header, mentions }, { quoted: m });
  }
}

export async function deleteLinkMessage(sock, m, groupSettings) {
  const sender = `@${m.sender.split('@')[0]}`;
  try {
    await sock.sendMessage(m.chat, { delete: { ...m.key, participant: m.sender } });
  } catch { /* may fail without admin rights */ }

  const warns = (groupSettings.warns = (groupSettings.warns || new Map())) && undefined;
  const g = getGroup(m.chat);
  g.linkStrikes = (g.linkStrikes || {});
  const key = m.sender;
  g.linkStrikes[key] = (g.linkStrikes[key] || 0) + 1;

  await sock.sendMessage(
    m.chat,
    { text: `🚫 *Anti-Link*\n\n${sender} — group links are not allowed here.\nStrike ${g.linkStrikes[key]}/3.`, mentions: [m.sender] },
    { quoted: m },
  );

  if (g.linkStrikes[key] >= 3 && m.isBotAdmin) {
    await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
    await sock.sendMessage(m.chat, { text: `👋 ${sender} removed after 3 link strikes.`, mentions: [m.sender] });
    delete g.linkStrikes[key];
  }
}

export async function restoreDeleted(sock, m) {
  const sender = `@${m.sender.split('@')[0]}`;
  const header = `♻️ *Anti-Delete*\n${sender} deleted a message.`;
  try {
    if (m.isMedia && m.mtype !== 'conversation' && m.mtype !== 'extendedTextMessage') {
      const buffer = await downloadMedia(sock, m.message, false);
      const type = m.mtype.replace('Message', '');
      const payload = { [type]: buffer, caption: `${header}\n${m.caption || ''}`.trim(), mentions: [m.sender] };
      if (type === 'audio') payload.mimetype = m.mimetype || 'audio/mp4';
      await sock.sendMessage(m.chat, payload, { quoted: m });
    } else {
      await sock.sendMessage(m.chat, { text: `${header}\n\n${m.text || '(empty)'}`, mentions: [m.sender] }, { quoted: m });
    }
  } catch {
    await sock.sendMessage(m.chat, { text: `${header}\n\n${m.text || '(media could not be restored)'}`, mentions: [m.sender] });
  }
}

export default { antiViewOnce, deleteLinkMessage, restoreDeleted };
