/**
 * PM2 — the standard way to keep a Node bot alive on a VPS or hosting.
 *
 *   npm install -g pm2
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup        # survive reboots
 *
 *   pm2 logs kashif-bot            # watch the log (the pairing code shows here)
 *   pm2 restart kashif-bot
 *   pm2 stop kashif-bot
 */
module.exports = {
  apps: [
    {
      name: 'kashif-bot',
      script: 'index.js',
      args: '--pair',
      cwd: __dirname,
      interpreter: 'node',
      node_args: '--dns-result-order=ipv4first',

      // keep it alive no matter what
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 50,
      min_uptime: '10s',
      max_memory_restart: '512M',

      // A WhatsApp bot holds ONE live socket — never cluster it.
      // Two instances = two logins = the number gets logged out.
      instances: 1,
      exec_mode: 'fork',

      watch: false,

      // One env block only: a second `env:` key would silently win and
      // drop these values.
      env: {
        NODE_ENV: 'production',
        AUTH_MODE: 'pair',
        PANEL_ENABLED: 'true',
        PANEL_HOST: '0.0.0.0',
        // Hosts such as KataBump re-sign outbound HTTPS with their own root
        // CA ("Kata Root CA"). Node ships a frozen root list and cannot see
        // it, so the WhatsApp socket dies mid-handshake and no pairing code
        // is ever issued. Pointing Node at the system bundle fixes that.
        // A missing file is harmless — Node warns and carries on.
        NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/ca-certificates.crt',
      },

      // logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
