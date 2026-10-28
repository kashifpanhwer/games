# ══════════════════════════════════════════════════════════════
#  Kashif Tech Advance Bot — Docker image
#
#  Build & run:
#     docker build -t kashif-bot .
#     docker run -d --name kashif-bot \
#       -p 3000:3000 \
#       -v kashif-session:/app/sessions \
#       --restart unless-stopped \
#       kashif-bot
#
#  Then open http://<host>:3000/?token=kashiftech and read the
#  pairing code with:   docker logs -f kashif-bot
# ══════════════════════════════════════════════════════════════
FROM node:20-bookworm-slim

# ffmpeg is needed for stickers / .tomp3 / .togif / .attp
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so the layer is cached between code changes
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy the bot
COPY . .

# Session + temp storage (mount a volume on /app/sessions to persist login)
RUN mkdir -p /app/sessions /app/tmp /app/logs
VOLUME ["/app/sessions"]

ENV NODE_ENV=production \
    PANEL_HOST=0.0.0.0 \
    PANEL_PORT=3000 \
    AUTH_MODE=pair

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/healthz || exit 1

# tini reaps zombies; exec form so SIGTERM reaches Node for a clean save
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--dns-result-order=ipv4first", "index.js", "--pair"]
