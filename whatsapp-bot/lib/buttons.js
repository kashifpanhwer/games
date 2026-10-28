import { config } from '../src/config.js';

/**
 * ─────────────────────────────────────────────────────────────
 *  Kashif Tech Advance Bot — Interactive Message (Button) engine
 *
 *  WhatsApp removed the old `buttonsMessage` / `templateMessage`
 *  for non-business accounts. The modern replacement is
 *  `interactiveMessage` carried inside a `viewOnceMessage`,
 *  with `nativeFlowMessage.buttons`. This module builds those
 *  payloads and transparently falls back to a plain text menu
 *  whenever the client refuses the rich format.
 * ─────────────────────────────────────────────────────────────
 */

export const quickReply = (id, displayText, description = '') => ({
  name: 'quick_reply',
  buttonParamsJson: JSON.stringify({
    display_text: displayText,
    id,
    ...(description ? { description } : {}),
  }),
});

export const singleSelect = (title, sections) => ({
  name: 'single_select',
  buttonParamsJson: JSON.stringify({
    title,
    sections: sections.map((s) => ({
      title: s.title,
      highlight_label: s.highlight_label || undefined,
      rows: (s.rows || []).map((r) => ({
        header: r.header || '',
        title: r.title,
        description: r.description || '',
        id: r.id,
      })),
    })),
  }),
});

export const urlButton = (url, displayText) => ({
  name: 'cta_url',
  buttonParamsJson: JSON.stringify({ display_text: displayText, url }),
});

export const callButton = (phone, displayText) => ({
  name: 'cta_call',
  buttonParamsJson: JSON.stringify({ display_text: displayText, id: phone }),
});

export const copyButton = (code, displayText) => ({
  name: 'cta_copy',
  buttonParamsJson: JSON.stringify({ display_text: displayText, id: code, copy_code: code }),
});

export const reminderButton = (title, displayText, epochSeconds) => ({
  name: 'reminder',
  buttonParamsJson: JSON.stringify({ display_text: displayText, title, id: String(epochSeconds) }),
});

/**
 * Build a full interactiveMessage payload.
 * @param {{text?:string, footer?:string, title?:string, subtitle?:string, buttons?:any[], media?:object, sections?:any[]}} o
 */
export function interactivePayload(o = {}) {
  const {
    text = '',
    footer = `© ${config.botAuthor} • ${config.botName}`,
    title,
    subtitle,
    buttons = [],
    media,
    sections,
  } = o;

  const flowButtons = [...buttons];
  if (sections && sections.length) {
    flowButtons.push(singleSelect(title ? '📋 Select' : '📋 Select', sections));
  }

  const header = {
    hasMediaAttachment: false,
    ...(title ? { title } : {}),
    ...(subtitle ? { subtitle } : {}),
  };

  // attach media to the header when supplied
  if (media) {
    if (media.image) {
      header.hasMediaAttachment = true;
      header.imageMessage = { url: media.image };
    } else if (media.video) {
      header.hasMediaAttachment = true;
      header.videoMessage = { url: media.video };
    } else if (media.document) {
      header.hasMediaAttachment = true;
      header.documentMessage = { url: media.document, mimetype: media.mimetype || 'application/pdf', fileName: media.fileName || 'Kashif Tech.pdf' };
    }
  }

  const interactiveMessage = {
    contextInfo: {
      mentionedJid: o.mentions || [],
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: o.newsletterJid || '120363353100415571@newsletter',
        newsletterName: config.botName,
        serverMessageId: -1,
      },
      externalAdReply: {
        title: config.botName,
        body: `${config.ownerName} • v${config.versionLabel}`,
        mediaType: 1,
        previewType: 'PHOTO',
        renderLargerThumbnail: true,
        thumbnailUrl: o.thumbnailUrl || '',
        sourceUrl: o.sourceUrl || 'https://github.com',
      },
    },
    body: { text },
    footer: { text: footer },
    header,
    nativeFlowMessage: {
      buttons: flowButtons,
      messageParamsJson: '',
    },
  };

  return {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
          interactiveMessageContextInfo: { uiStyle: 1 },
        },
        interactiveMessage,
      },
    },
  };
}

/** Swipeable multi-card menu. */
export function carouselPayload(cards = [], opts = {}) {
  return {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: {
          contextInfo: { forwardingScore: 999, isForwarded: true },
          body: { text: opts.text || '' },
          footer: { text: opts.footer || `© ${config.botAuthor}` },
          carouselMessage: {
            cards: cards.map((c) => {
              const p = interactivePayload(c);
              return p.viewOnceMessage.message.interactiveMessage;
            }),
            messageVersion: 1,
          },
        },
      },
    },
  };
}

/**
 * Send an interactive message, falling back to text if the recipient's
 * WhatsApp client rejects the rich format.
 * Returns the strategy actually used: 'buttons' | 'carousel' | 'list' | 'text'
 */
export async function sendInteractive(sock, jid, payload, fallbackText, opts = {}) {
  try {
    await sock.sendMessage(jid, payload, opts);
    return payload.carouselMessage || payload.viewOnceMessage?.message?.interactiveMessage?.carouselMessage
      ? 'carousel'
      : 'buttons';
  } catch (err) {
    // 479 / "Invalid interactive message" => client does not support buttons
    try {
      await sock.sendMessage(jid, { text: fallbackText }, opts);
      return 'text';
    } catch (e2) {
      throw new Error(`interactive send failed: ${err.message}; text fallback failed: ${e2.message}`);
    }
  }
}

/** Extract the button/list id the user pressed. */
export function extractButtonId(m = {}) {
  const msg = m.message || {};
  const candidates = [
    msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
    msg.buttonsResponseMessage?.selectedButtonId,
    msg.buttonsResponseMessage?.selectedId,
    msg.templateButtonReplyMessage?.selectedId,
    msg.listResponseMessage?.singleSelectReply?.selectedRows?.[0]?.rowId,
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === 'string') {
      try {
        const parsed = JSON.parse(c);
        return parsed.id || parsed.selectedId || c;
      } catch {
        return c;
      }
    }
    return c;
  }
  return null;
}

/**
 * Render any button payload as plain text so that the fallback menu is
 * always an exact mirror of the button menu.
 */
export function buttonsToText(payload) {
  try {
    const im = payload.viewOnceMessage.message.interactiveMessage;
    if (im.carouselMessage) {
      const out = [];
      im.carouselMessage.cards.forEach((card, i) => {
        out.push(`\n━━━ ${i + 1}. ${card.header?.title || 'CARD'} ━━━`);
        if (card.body?.text) out.push(card.body.text);
        card.nativeFlowMessage?.buttons?.forEach((b) => {
          const p = JSON.parse(b.buttonParamsJson);
          out.push(`  ▸ ${p.display_text || p.title}`);
        });
      });
      return out.join('\n');
    }
    const lines = [];
    if (im.header?.title) lines.push(`╭─ ${im.header.title}`);
    if (im.body?.text) lines.push(im.body.text);
    im.nativeFlowMessage?.buttons?.forEach((b) => {
      const p = JSON.parse(b.buttonParamsJson || '{}');
      if (b.name === 'single_select') {
        lines.push(`\n┌─ ${p.title}`);
        p.sections?.forEach((s) => {
          lines.push(`│ 【 ${s.title} 】`);
          s.rows?.forEach((r, idx) => lines.push(`│ ${idx + 1}. ${r.title}${r.description ? ' — ' + r.description : ''}`));
        });
        lines.push('└─');
      } else {
        lines.push(`  ▸ ${p.display_text || p.title || b.name}`);
      }
    });
    if (im.footer?.text) lines.push(`\n${im.footer.text}`);
    return lines.join('\n');
  } catch {
    return '';
  }
}

export default {
  quickReply,
  singleSelect,
  urlButton,
  callButton,
  copyButton,
  reminderButton,
  interactivePayload,
  carouselPayload,
  sendInteractive,
  extractButtonId,
  buttonsToText,
};
