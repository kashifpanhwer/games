#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  KASHIF TECH ADVANCE BOT — one-command hosting deploy
#
#  Upload the folder to your VPS / hosting, then:
#
#      bash deploy.sh
#
#  It installs everything, writes .env, checks the network, and
#  asks how you want to keep the bot running.
# ══════════════════════════════════════════════════════════════
set -uo pipefail

G="\033[32m"; R="\033[31m"; Y="\033[33m"; C="\033[36m"; B="\033[1m"; D="\033[90m"; N="\033[0m"
say()  { printf "${C}▸${N} %s\n" "$1"; }
good() { printf "${G}✔${N} %s\n" "$1"; }
warn() { printf "${Y}⚠${N} %s\n" "$1"; }
die()  { printf "${R}✖${N} %s\n" "$1"; exit 1; }

cd "$(dirname "$0")" || die "cannot enter the bot folder"
BOT_DIR="$(pwd)"

printf "\n${B}${C}╔══════════════════════════════════════════════════════════╗
║   ⚡  KASHIF TECH ADVANCE BOT — DEPLOY                     ║
╚══════════════════════════════════════════════════════════╝${N}\n"
say "Folder: ${D}${BOT_DIR}${N}"
say "OS:     ${D}$(uname -sr)  •  $( [ -f /etc/os-release ] && . /etc/os-release && echo "$PRETTY_NAME" || echo unknown )${N}"

# ── 1. Node.js ────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  warn "Node.js not found."
  if command -v apt-get >/dev/null 2>&1; then
    say "Installing Node 20 via NodeSource…"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs \
      || die "could not install Node — install Node 20+ manually: https://nodejs.org"
  elif command -v dnf >/dev/null 2>&1; then
    dnf module install -y nodejs:20 || die "could not install Node via dnf"
  else
    die "Install Node.js 20 or newer, then re-run: https://nodejs.org"
  fi
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  warn "Node $NODE_MAJOR detected — the bot wants Node 20+. It may still run."
else
  good "Node $(node -v)"
fi
good "npm $(npm -v)"

# ── 2. ffmpeg (stickers / audio conversion) ───────────────────
if command -v ffmpeg >/dev/null 2>&1; then
  good "system ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"
else
  say "ffmpeg not found — trying to install (needed for stickers/.tomp3/.togif)…"
  if command -v apt-get >/dev/null 2>&1; then apt-get install -y ffmpeg >/dev/null 2>&1 && good "ffmpeg installed" || warn "apt install failed — the bundled npm ffmpeg will be used instead"
  elif command -v dnf >/dev/null 2>&1; then dnf install -y ffmpeg >/dev/null 2>&1 && good "ffmpeg installed" || warn "dnf install failed — the bundled npm ffmpeg will be used"
  else warn "install ffmpeg manually for full media support"; fi
fi

# ── 3. dependencies ───────────────────────────────────────────
say "Installing Node dependencies (first time takes a few minutes)…"
npm install --omit=dev --no-audit --no-fund || die "npm install failed"
good "dependencies installed"

# ── 4. .env ───────────────────────────────────────────────────
if [ ! -f .env ]; then
  say "Creating .env…"
  cp .env.example .env

  printf "\n  ${B}Your WhatsApp number${N} (country code + number, digits only)\n"
  printf "  Pakistan: ${C}923145396910${N}  — NOT 03145396910\n"
  printf "  ${D}Press Enter to keep 923145396910${N}\n  > "
  read -r NUM || NUM=""
  NUM="${NUM//[^0-9]/}"
  if [ -n "$NUM" ]; then
    case "$NUM" in 0[0-9]*) NUM="92${NUM#0}"; warn "converted leading 0 → 92 ($NUM)";; esac
    sed -i "s/^PAIRING_NUMBER=.*/PAIRING_NUMBER=$NUM/" .env
    sed -i "s/^OWNER_NUMBER=.*/OWNER_NUMBER=$NUM/"     .env
    good "number set to +$NUM"
  else
    good "kept the default +923145396910"
  fi

  # never ship the default panel token onto a public server
  TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-20)
  sed -i "s/^PANEL_TOKEN=.*/PANEL_TOKEN=$TOKEN/" .env
  good "PANEL_TOKEN randomised → ${C}$TOKEN${N}"
  PANEL_TOKEN="$TOKEN"

  printf "\n  ${B}Optional AI key${N} for .ai / .summarize  ${D}(Enter to skip)${N}\n  GEMINI_API_KEY > "
  read -r GK || GK=""
  [ -n "$GK" ] && sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$GK|" .env && good "Gemini key saved" || say "skipped — .ai will report that no key is set"
else
  good ".env already exists — leaving it untouched"
  PANEL_TOKEN=$(grep '^PANEL_TOKEN=' .env | cut -d= -f2)
fi

mkdir -p sessions tmp logs

# Hosts such as KataBump re-sign outbound HTTPS with their own root CA.
# Node ignores the system bundle unless told, which breaks the WhatsApp socket.
for bundle in /etc/ssl/certs/ca-certificates.crt /etc/pki/tls/certs/ca-bundle.crt /etc/ssl/cert.pem; do
  [ -r "$bundle" ] && export NODE_EXTRA_CA_CERTS="$bundle" && say "trusting the host CA bundle: $bundle" && break
done

# ── 5. health check ───────────────────────────────────────────
printf "\n${B}Checking whether this server can reach WhatsApp…${N}\n"
DOCTOR_OK=1
npm run --silent doctor || DOCTOR_OK=0

PORT=$(grep '^PANEL_PORT=' .env | cut -d= -f2); PORT="${PORT:-3000}"
IP=$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || echo 'YOUR_SERVER_IP')

# ── 6. how to run ─────────────────────────────────────────────
printf "\n${B}${C}╔══════════════════════════════════════════════════════════╗${N}\n"
if [ "$DOCTOR_OK" = "1" ]; then
printf "${B}${G}║   ✅  READY — this server can obtain a pairing code      ║${N}\n"
else
printf "${B}${Y}║   ⚠  Doctor found a problem — read the report above     ║${N}\n"
fi
printf "${B}${C}╚══════════════════════════════════════════════════════════╝${N}\n\n"

cat <<MENU
  ${B}How do you want to keep the bot running?${N}

    ${C}1${N}) PM2        — recommended, auto-restart + logs + boot survival
    ${C}2${N}) systemd    — native Linux service (needs sudo)
    ${C}3${N}) Docker     — containerised (needs docker installed)
    ${C}4${N}) nohup      — simple background process, no extra tools
    ${C}5${N}) foreground — run here so I can see the pairing code now
    ${C}q${N}) quit, I will start it myself

MENU
printf "  Choice ${D}[1-5/q]${N}: "
read -r CHOICE || CHOICE=1

case "${CHOICE:-1}" in
  1)
    command -v pm2 >/dev/null 2>&1 || { say "installing pm2…"; npm install -g pm2 || die "pm2 install failed"; }
    pm2 start ecosystem.config.cjs && pm2 save
    say "Run 'pm2 startup' (and copy the command it prints) to survive reboots."
    good "started under PM2"
    say "Watch the pairing code with:  ${C}pm2 logs kashif-bot${N}"
    ;;
  2)
    if [ "$(id -u)" != "0" ]; then warn "systemd needs sudo — re-run this option as root"; fi
    sed "s#WorkingDirectory=.*#WorkingDirectory=${BOT_DIR}#" deploy/kashif-bot.service \
      | sed "s#EnvironmentFile=.*#EnvironmentFile=-${BOT_DIR}/.env#" \
      | sed "s#ReadWritePaths=.*#ReadWritePaths=${BOT_DIR}#" > /tmp/kashif-bot.service
    cp /tmp/kashif-bot.service /etc/systemd/system/kashif-bot.service 2>/dev/null \
      || { warn "cannot write to /etc/systemd/system — saved to ./kashif-bot.service instead"; cp /tmp/kashif-bot.service ./kashif-bot.service; }
    systemctl daemon-reload && systemctl enable --now kashif-bot && good "systemd service running"
    say "Watch the pairing code with:  ${C}journalctl -u kashif-bot -f${N}"
    ;;
  3)
    command -v docker >/dev/null 2>&1 || die "docker not installed"
    docker compose up -d --build 2>/dev/null || docker-compose up -d --build
    good "container started"
    say "Watch the pairing code with:  ${C}docker logs -f kashif-bot${N}"
    ;;
  4)
    nohup node --dns-result-order=ipv4first index.js --pair > logs/bot.log 2>&1 &
    sleep 2
    good "running in the background (PID $!)"
    say "Watch the pairing code with:  ${C}tail -f logs/bot.log${N}"
    ;;
  5)
    printf "\n${D}──── bot output (Ctrl+C twice to stop) ────${N}\n\n"
    npm run pair
    exit 0
    ;;
  *) say "Nothing started. Start it later with:  ${C}npm run pair${N}";;
esac

cat <<FOOT

${B}──────────────────────────────────────────────────────────${N}
${B}🔑 Getting your pairing code${N}

  ${C}npm run pair${N}          prints it in the terminal
  ${C}curl -s localhost:${PORT}/api/pairing?token=${PANEL_TOKEN}${N}
                        prints just the code (handy over SSH)

${B}🌐 Web control panel${N}

  On this server : http://localhost:${PORT}/?token=${PANEL_TOKEN}
  From anywhere  : http://${IP}:${PORT}/?token=${PANEL_TOKEN}

  ${Y}If that URL does not open, allow TCP ${PORT} in your firewall /${N}
  ${Y}hosting security group:${N}
      ${C}ufw allow ${PORT}/tcp${N}        ${D}(Ubuntu)${N}
      ${C}firewall-cmd --add-port=${PORT}/tcp --permanent && firewall-cmd --reload${N}

  Then on your phone: WhatsApp ▸ Settings ▸ Linked Devices ▸ Link a Device
  ▸ "Link with phone number instead" ▸ type the 8 characters.

${B}⚠️  Shared hosting (cPanel / Hostinger shared plans)${N}
  These kill long-running processes, so the bot will keep disconnecting.
  You need a ${B}VPS${N}, a Node host (Render / Railway / Fly.io), Docker, or Termux.

FOOT
