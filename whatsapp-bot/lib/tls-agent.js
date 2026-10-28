/**
 * ─────────────────────────────────────────────────────────────────
 *  TLS / CA TRUST FOR PROXIED HOSTS
 * ─────────────────────────────────────────────────────────────────
 *  Some hosts sit in the middle of your outbound HTTPS and re-sign it
 *  with their own root certificate. KataBump does exactly this with a
 *  "Kata Root CA"; corporate networks, Zscaler, Bluecoat and some VPS
 *  providers do the same.
 *
 *  The symptom is confusing: DNS works, TCP works, but the WebSocket to
 *  web.whatsapp.com dies during the handshake with
 *      "unable to verify the first certificate"
 *      "self-signed certificate in certificate chain"
 *  …so no pairing code is ever issued.
 *
 *  The reason: Node.js does NOT read /etc/ssl/certs. It ships its own
 *  frozen list of root CAs, so it cannot see the host's root.
 *
 *  Two ways out, and this module implements both:
 *    1. NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
 *       (set it before Node starts — the deploy files do this for you)
 *    2. hand Baileys an https.Agent whose `ca` list ALSO contains the
 *       system bundle. Baileys forwards it to `new WebSocket(url, {agent})`,
 *       which is what makes the WhatsApp socket trust the proxy.
 *
 *  Option 2 is applied automatically at runtime, so the bot works even
 *  when nobody remembered the environment variable.
 * ─────────────────────────────────────────────────────────────────
 *
 *  Environment variables
 *    WA_TRUST_SYSTEM_CA   "false" disables auto-detection      (default: true)
 *    WA_EXTRA_CA          extra PEM bundle(s) to trust, comma-separated
 *    WA_TLS_INSECURE      "true" skips certificate validation entirely.
 *                         LAST RESORT — it makes the connection MITM-able.
 *                         Only use it to prove that TLS is the problem.
 */

import fs from 'node:fs';
import tls from 'node:tls';
import https from 'node:https';

/** System CA bundle locations, in the order they are tried. */
const SYSTEM_BUNDLES = [
  '/etc/ssl/certs/ca-certificates.crt',   // Debian / Ubuntu / KataBump
  '/etc/pki/tls/certs/ca-bundle.crt',     // RHEL / CentOS / Fedora
  '/etc/pki/tls/cert.pem',
  '/etc/ssl/ca-bundle.pem',               // openSUSE
  '/etc/ssl/cert.pem',                    // Alpine / macOS
];

const PEM_RE = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

/** Strip headers/whitespace so two PEMs can be compared as opaque blobs. */
const fingerprint = (pem) =>
  pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '').slice(0, 64);

function splitPem(text) {
  return (text.match(PEM_RE) || []).map((c) => c.trim());
}

/**
 * Collect CA certificates the running Node does NOT already trust.
 * @returns {{path: string|null, certs: string[]}}
 */
export function findExtraSystemCAs() {
  const known = new Set(tls.rootCertificates.map(fingerprint));
  const bundles = [
    ...(process.env.WA_EXTRA_CA || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    ...(process.env.WA_TRUST_SYSTEM_CA === 'false' ? [] : SYSTEM_BUNDLES),
  ];

  for (const path of bundles) {
    let text;
    try {
      text = fs.readFileSync(path, 'utf8');
    } catch {
      continue;                                    // not present / not readable
    }
    const certs = splitPem(text).filter((c) => !known.has(fingerprint(c)));
    if (certs.length) return { path, certs };
  }
  return { path: null, certs: [] };
}

/**
 * Build the agent Baileys should use for its WebSocket, plus a human-readable
 * report for the startup banner and the doctor.
 *
 * Returns `{ agent, mode, detail }` where `agent` is `undefined` when nothing
 * special is needed — that keeps the default code path completely untouched.
 */
export function buildSocketAgent() {
  // ── escape hatch: skip verification entirely ─────────────────────
  if (process.env.WA_TLS_INSECURE === 'true') {
    return {
      agent: new https.Agent({ rejectUnauthorized: false, keepAlive: true }),
      mode: 'insecure',
      detail: 'WA_TLS_INSECURE=true — certificate validation is DISABLED',
    };
  }

  const { path, certs } = findExtraSystemCAs();
  if (!certs.length) {
    return {
      agent: undefined,
      mode: 'default',
      detail: 'using Node’s built-in root CAs',
    };
  }

  // `ca` REPLACES Node's default list, so the built-in roots must be kept.
  const agent = new https.Agent({
    ca: [...tls.rootCertificates, ...certs],
    keepAlive: true,
  });

  // Best effort: make plain https requests (axios → media upload/download,
  // scrapers) trust the same roots, in case NODE_EXTRA_CA_CERTS is unset.
  try {
    https.globalAgent.options.ca = [...tls.rootCertificates, ...certs];
  } catch { /* older Node */ }

  return {
    agent,
    mode: 'system-ca',
    detail: `${certs.length} extra root CA(s) from ${path}`,
  };
}

/** One-line summary for logs / the doctor. */
export function tlsSummary() {
  const { mode, detail } = buildSocketAgent();
  const marker = { default: '✔', 'system-ca': '⚠', insecure: '✖' }[mode] || '•';
  return `${marker} TLS trust: ${mode} (${detail})`;
}
