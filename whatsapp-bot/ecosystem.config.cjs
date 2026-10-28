{
  /**
   * PM2 — the standard way to keep a Node bot alive on a VPS or hosting.
   *
   *   npm install -g pm2
   *   pm2 start ecosystem.config.cjs
   *   pm2 save && pm2 startup        # survive reboots
   *
   *   pm2 logs kashif-bot            # watch the log
   *   pm2 restart kashif-bot
   *   pm2 stop kashif-bot
   */
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

      // a WhatsApp bot holds one live socket — never cluster it
      instances: 1,
      exec_mode: 'fork',

      watch: false,
      env: {
        NODE_ENV: 'production',
        AUTH_MODE: 'pair',
        PANEL_ENABLED: 'true',
        PANEL_HOST: '0.0.0.0',
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
