import { config } from './config.js';
import { db } from './database.js';
import { pushLog } from './state.js';

/**
 * Anti-call: automatically reject incoming calls and warn the caller.
 * Toggle with `.anticall on|off` (owner).
 */
export async function handleCall(sock, calls) {
  if (!db.settings.antiCall) return;
  for (const call of calls || []) {
    if (call.status !== 'offer') continue;
    const from = call.from || call.chatId;
    pushLog('info', `Incoming call from ${from} — rejecting`);
    try {
      await sock.rejectCall(call.id, from);
    } catch (err) {
      pushLog('warn', `rejectCall failed: ${err.message}`);
    }
    try {
      await sock.sendMessage(from, {
        text: `📵 *Calls are not accepted by ${config.botName}*.\nYour call was automatically rejected.`,
      });
    } catch { /* ignore */ }
  }
}

export default { handleCall };
