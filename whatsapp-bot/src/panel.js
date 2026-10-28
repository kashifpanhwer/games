import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { connState, events, pushLog, snapshot } from './state.js';
import { stats } from './plugins.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_FILE = path.join(__dirname, 'panel.html');

/**
 * ─────────────────────────────────────────────────────────────
 *  WEB CONTROL PANEL
 *  • live pairing code + QR code
 *  • streaming logs (Server-Sent Events)
 *  • restart / logout / re-pair / menu-style controls
 *
 *  Binds 0.0.0.0 so it works behind reverse proxies, tunnels and
 *  container port-forwards. Everything is token gated.
 * ─────────────────────────────────────────────────────────────
 */

let server = null;

export function startPanel() {
  if (!config.panelEnabled) {
    pushLog('info', 'Web panel disabled (PANEL_ENABLED=false)');
    return null;
  }

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.disable('x-powered-by');

  const checkToken = (req, res, next) => {
    const t = req.query.token || req.headers['x-panel-token'] || req.body?.token;
    if (t !== config.panelToken) return res.status(401).json({ error: 'invalid or missing token' });
    next();
  };

  app.get('/healthz', (_req, res) => res.json({ ok: true, status: connState.status }));

  app.get('/api/state', checkToken, (_req, res) => res.json(snapshot()));

  app.get('/api/pairing', checkToken, (_req, res) =>
    res.json({
      code: connState.pairingCode,
      pretty: connState.pairingCodePretty,
      number: connState.pairingNumber,
      issuedAt: connState.pairingIssuedAt,
      status: connState.status,
    }),
  );

  app.get('/api/qr', checkToken, (req, res) => {
    if (!connState.qrRaw) return res.status(404).json({ error: 'no QR available right now' });
    if (req.query.format === 'raw') return res.type('txt').send(connState.qrRaw);
    res.type('png');
    res.send(connState.qrDataUrl ? Buffer.from(connState.qrDataUrl.split(',')[1], 'base64') : Buffer.alloc(0));
  });

  app.get('/api/commands', checkToken, async (_req, res) => {
    const { byCategory } = await import('./plugins.js');
    res.json({
      ...stats(),
      categories: [...byCategory].map(([cat, list]) => ({
        category: cat,
        count: list.length,
        commands: list.map((p) => ({ name: p.name, aliases: p.aliases, desc: p.desc, use: p.use, owner: p.owner, group: p.group, admin: p.admin })),
      })),
    });
  });

  app.get('/api/events', checkToken, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('state', snapshot());

    const onLog = (entry) => send('log', entry);
    const onPair = (p) => send('pairing', p);
    const onTick = () => send('state', snapshot());

    events.on('log', onLog);
    events.on('pairing', onPair);
    const timer = setInterval(onTick, 3000);

    req.on('close', () => {
      clearInterval(timer);
      events.off('log', onLog);
      events.off('pairing', onPair);
    });
  });

  app.post('/api/restart', checkToken, async (_req, res) => {
    res.json({ ok: true, message: 'restarting connection' });
    const { restart } = await import('./connection.js');
    restart().catch((e) => pushLog('error', `manual restart failed: ${e.message}`));
  });

  app.post('/api/logout', checkToken, async (_req, res) => {
    res.json({ ok: true, message: 'logging out' });
    const { logout } = await import('./connection.js');
    logout().catch((e) => pushLog('error', `logout failed: ${e.message}`));
  });

  app.post('/api/pair', checkToken, async (req, res) => {
    const number = String(req.body?.number || req.query?.number || '').replace(/\D/g, '');
    if (!number || number.length < 8) return res.status(400).json({ error: 'provide a valid number (digits only, with country code)' });
    config.pairingNumber = number;
    process.env.PAIRING_NUMBER = number;
    res.json({ ok: true, message: `requesting a pairing code for +${number}` });
    const { restart } = await import('./connection.js');
    restart('pair').catch((e) => pushLog('error', `re-pair failed: ${e.message}`));
  });

  app.post('/api/menu', checkToken, async (req, res) => {
    const v = String(req.body?.type || req.query?.type || '').toLowerCase();
    if (!['buttons', 'carousel', 'list', 'text'].includes(v)) return res.status(400).json({ error: 'type must be buttons|carousel|list|text' });
    const { setSetting } = await import('./database.js');
    setSetting('menuType', v);
    res.json({ ok: true, menuType: v });
  });

  app.get('/', (req, res) => {
    if ((req.query.token || '') !== config.panelToken) return res.status(401).type('html').send('<h1 style="font-family:sans-serif">401 — add ?token=YOUR_PANEL_TOKEN</h1>');
    res.type('html').send(pageHtml());
  });

  server = app.listen(config.panelPort, config.panelHost, () => {
    const shown = config.panelHost === '0.0.0.0' ? 'localhost' : config.panelHost;
    pushLog('ok', `🌐 Web panel ready → http://${shown}:${config.panelPort}/?token=${config.panelToken}`);
    console.log(`\x1b[36m   Panel: http://${shown}:${config.panelPort}/?token=${config.panelToken}\x1b[0m`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      pushLog('error', `Panel port ${config.panelPort} is already in use — set PANEL_PORT in .env`);
    } else {
      pushLog('error', `Panel error: ${err.message}`);
    }
  });

  return server;
}

export function stopPanel() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
}

/* ═══════════════════════════════ UI ═══════════════════════════════ */

/** The dashboard markup lives in panel.html so its own JS template
 *  literals are not mangled by Node's template interpolation. */
let pageCache = null;
function pageHtml() {
  if (!pageCache || process.env.PANEL_DEV) pageCache = fs.readFileSync(PAGE_FILE, 'utf8');
  return pageCache;
}

export default { startPanel, stopPanel };
