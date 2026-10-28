#!/data/data/com.termux/files/usr/bin/bash
# ══════════════════════════════════════════════════════════════
#  KASHIF TECH ADVANCE BOT — Termux installer (Android)
#
#  One command, start to finish:
#
#     pkg install -y git && git clone https://github.com/kashifpanhwer/games \
#       && cd games/whatsapp-bot && bash scripts/install-termux.sh
#
#  Or, if the folder is already on your phone:
#
#     cd whatsapp-bot && bash scripts/install-termux.sh
# ══════════════════════════════════════════════════════════════
set -uo pipefail

G="\033[32m"; R="\033[31m"; Y="\033[33m"; C="\033[36m"; B="\033[1m"; D="\033[90m"; N="\033[0m"
say()  { printf "${C}▸${N} %s\n" "$1"; }
good() { printf "${G}✔${N} %s\n" "$1"; }
warn() { printf "${Y}⚠${N} %s\n" "$1"; }
die()  { printf "${R}✖${N} %s\n" "$1"; exit 1; }

cd "$(dirname "$0")/.." || die "could not enter the bot folder"
BOT_DIR="$(pwd)"

printf "\n${B}${C}╔══════════════════════════════════════════════════════════╗
║   ⚡  KASHIF TECH ADVANCE BOT — TERMUX SETUP               ║
╚══════════════════════════════════════════════════════════╝${N}\n"
say "Working in: ${D}${BOT_DIR}${N}"

# ── 0. Am I actually on Termux? ────────────────────────────────
if [ ! -d "/data/data/com.termux" ]; then
  warn "This does not look like Termux. The script will still try, but"
  warn "package names may differ. On a PC just run:  npm install && npm run pair"
fi

# ── 1. Stop Android from killing the bot in the background ─────
say "Acquiring a wake-lock so Android does not kill the bot…"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock && good "wake-lock ON" \
  || warn "termux-wake-lock not available (install the Termux:API app for it)"

cat <<TIP

  ${B}IMPORTANT — do this once, or Android will kill the bot:${N}
    1. Termux ▸ notification ▸ ${B}Acquire wakelock${N}
    2. Android Settings ▸ Apps ▸ Termux ▸ Battery ▸ ${B}Unrestricted${N}
    3. Remove Termux from "recent apps" only AFTER step 2

TIP

# ── 2. Storage access (so you can share media in/out) ──────────
if [ ! -d "$HOME/storage/shared" ]; then
  say "Requesting shared-storage access (needed for .tourl / stickers)…"
  termux-setup-storage >/dev/null 2>&1 || true
  sleep 2
  [ -d "$HOME/storage/shared" ] && good "storage linked at ~/storage/shared" \
    || warn "storage not linked — tap ALLOW if a popup appears, then re-run"
else
  good "storage already linked"
fi

# ── 3. System packages ────────────────────────────────────────
say "Updating package lists…"
pkg update -y >/dev/null 2>&1 && good "pkg updated" || warn "pkg update had issues — continuing"

NEED=""
for p in nodejs-lts git ffmpeg python libwebp; do
  if pkg list-installed 2>/dev/null | grep -q "^${p}/"; then
    good "$p already installed"
  else
    NEED="$NEED $p"
  fi
done

if [ -n "$NEED" ]; then
  say "Installing:${B}$NEED${N}  (this can take a few minutes)"
  pkg install -y $NEED || die "package install failed — check your internet and re-run"
fi

# ffmpeg must expose libwebp or stickers will not work
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libwebp; then
  good "ffmpeg has libwebp (stickers will work)"
else
  warn "ffmpeg lacks libwebp — reinstall it:  pkg uninstall ffmpeg && pkg install ffmpeg libwebp"
fi

say "Node $(node -v 2>/dev/null || echo '??')   npm $(npm -v 2>/dev/null || echo '??')   ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"

# ── 4. .env ───────────────────────────────────────────────────
if [ ! -f .env ]; then
  say "Creating .env from the template…"
  cp .env.example .env && good ".env created"

  printf "\n  ${B}Enter your WhatsApp number${N} (country code + number, digits only)\n"
  printf "  Pakistan example: ${C}923145396910${N}   — NOT 03145396910\n"
  printf "  ${D}Press Enter to keep 923145396910${N}\n  > "
  read -r NUM
  NUM="${NUM//[^0-9]/}"
  if [ -n "$NUM" ]; then
    case "$NUM" in
      0[0-9]*) NUM="92${NUM#0}"; warn "converted leading 0 → 92 ($NUM)";;
    esac
    sed -i "s/^PAIRING_NUMBER=.*/PAIRING_NUMBER=$NUM/" .env
    sed -i "s/^OWNER_NUMBER=.*/OWNER_NUMBER=$NUM/"   .env
    good "number set to +$NUM"
  else
    good "kept the default +923145396910"
  fi

  # a random panel token instead of the shipped default
  TOKEN=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-16)
  sed -i "s/^PANEL_TOKEN=.*/PANEL_TOKEN=$TOKEN/" .env
  good "PANEL_TOKEN randomised → ${C}$TOKEN${N}"
else
  good ".env already exists — leaving it untouched"
fi

# ── 5. Node modules ───────────────────────────────────────────
say "Installing Node dependencies (first run takes a while)…"
npm install --no-audit --no-fund || die "npm install failed"
good "dependencies installed"

# ── 6. Health check ───────────────────────────────────────────
printf "\n${B}Running the network doctor…${N}\n"
if npm run --silent doctor; then
  DOCTOR_OK=1
else
  DOCTOR_OK=0
fi

# ── 7. Run ────────────────────────────────────────────────────
printf "\n${B}${C}╔══════════════════════════════════════════════════════════╗${N}\n"
if [ "$DOCTOR_OK" = "1" ]; then
printf "${B}${G}║   ✅  READY — this phone can obtain a pairing code       ║${N}\n"
else
printf "${B}${Y}║   ⚠  Doctor found a problem — see the report above      ║${N}\n"
fi
printf "${B}${C}╚══════════════════════════════════════════════════════════╝${N}\n\n"

printf "  Start the bot now?  ${D}[Y/n]${N} "
read -r GO
case "${GO:-Y}" in
  [nN]*) say "Skipped. Start it later with:  ${C}npm run pair${N}";;
  *)
    printf "\n${D}──── bot output (Ctrl+C twice to stop) ────${N}\n\n"
    npm run pair
    ;;
esac

cat <<FOOT

${B}Useful commands${N}
  ${C}npm run pair${N}       request a fresh pairing code
  ${C}npm run qr${N}         scan a QR code instead
  ${C}npm run doctor${N}     diagnose why a code is not appearing
  ${C}npm test${N}           run the 39 offline checks
  ${C}npm run preview${N}    render the button menu without connecting
  ${C}npm run clean${N}      wipe the session and re-pair from scratch

${B}Keep it running after you close Termux${N}
  ${C}pkg install -y termux-services${N}
  ${C}nohup npm run pair > bot.log 2>&1 &${N}      # survives closing the app
  ${C}tail -f bot.log${N}                           # watch the log

${B}Open the control panel from your phone's browser${N}
  http://localhost:3000/?token=${C}$(grep '^PANEL_TOKEN=' .env 2>/dev/null | cut -d= -f2)${N}

FOOT
