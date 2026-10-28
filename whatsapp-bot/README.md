# ⚡ Kashif Tech Advance Bot

An advanced **multi-device WhatsApp bot** built on [Baileys](https://github.com/WhiskeySockets/Baileys).
It logs in with an **8-character pairing code** (no QR scan needed), drives everything from a
**native button menu**, and ships with a **live web control panel**.

```
╔══════════════════════════════════════════════════════════╗
║   ⚡  KASHIF TECH ADVANCE BOT  v2.0.0
╚══════════════════════════════════════════════════════════╝
```

| | |
|---|---|
| **Plugins** | 121 |
| **Command triggers** | 365 (names + aliases) |
| **Menu categories** | 11 |
| **Runtime** | Node.js ≥ 20 (ESM) |
| **Login** | Pairing code *(default)* or QR |
| **Tests** | `npm test` → 40 offline checks (incl. a real SIGTERM lifecycle test) |

---

## 🚀 Quick start

```bash
cd whatsapp-bot
npm install
cp .env.example .env      # then edit it
npm run pair              # prints your 8-character pairing code
```

Open **http://localhost:3000/?token=kashiftech** for the live control panel.

### 🔑 How to link your phone

1. Run `npm run pair`.
2. The terminal prints a box like this:

   ```
   YOUR WHATSAPP PAIRING CODE :   7Q5J-S2QD
   FOR NUMBER               :   +923145396910
   ```

3. On the phone holding **+92 314 5396910**, open WhatsApp.
4. **Settings ▸ Linked Devices ▸ Link a Device**
5. Tap **“Link with phone number instead”**.
6. Type the 8 characters. Done — the bot is online.

> ⏱️ A pairing code lives for roughly **60 seconds**. If it expires, press
> **🔄 Request new code** in the web panel (or re-run `npm run pair`).

### اردو / Roman Urdu

```
1. npm install chalayein
2. .env file mein apna number likhein (PAIRING_NUMBER=923145396910)
3. npm run pair chalayein
4. Terminal par 8 character ka code aayega
5. WhatsApp > Settings > Linked Devices > Link a Device
6. "Link with phone number instead" par tap karein
7. Code type karein — bot online ho jayega
```

---

## 🖥️ Web control panel

Starts automatically on port `3000` (configurable). Token-gated — every request needs
`?token=YOUR_PANEL_TOKEN`.

| Endpoint | What it does |
|---|---|
| `GET /` | Dark-themed dashboard: live code, QR, stats, logs |
| `GET /api/state` | Full JSON snapshot (status, counters, last 80 log lines) |
| `GET /api/pairing` | Just the current pairing code + target number |
| `GET /api/qr` | QR as PNG (`?format=raw` for the raw string) |
| `GET /api/commands` | Every plugin, alias and category |
| `GET /api/events` | **Server-Sent Events** stream — no polling |
| `POST /api/pair?number=923…` | Re-pair with a different number |
| `POST /api/menu?type=carousel` | Change the menu style live |
| `POST /api/restart` | Restart the WhatsApp connection |
| `POST /api/logout` | Delete the session |
| `GET /healthz` | Liveness probe (no token needed) |

---

## 🎛️ The button menu

WhatsApp removed the old `buttonsMessage` for non-business accounts. This bot uses the modern
replacement — an **`interactiveMessage` wrapped in a `viewOnceMessage`**, carrying
`nativeFlowMessage.buttons`.

`plugins/menu.js` builds it:

```
╭───「 KASHIF TECH ADVANCE BOT 」
│
│ 👤 User     : Kashif
│ 📱 Number   : +923145396910
│ ⚡ Status   : Online 🟢
│ 🕒 Runtime  : 2h 14m
│ 🧩 Commands : 365 in 11 menus
│ 💬 Mode     : Public 🌐
│ 🌙 Time     : 11:24 pm (PKT)
│
╰── Ready when you are 🚀 — tap a button below 👇

 [ 🧑‍💻 Owner ]  [ 👥 Group ]  [ ⬇️ Downloader ]  [ 🤖 AI ]
 [ 🛠️ Tools ]  [ 🔎 Search ]  [ 🎮 Fun ]        [ 🕌 Islamic ]
 [ 📜 More Categories ]  [ ▾ 📋 All Commands ]
```

Every category button opens its own sub-menu of command buttons, each with a
**🏠 Back to Main Menu** button. Button presses are routed straight back into the command
engine, so a button *is* a command — there is no separate handler to maintain.

Preview any menu without connecting to WhatsApp:

```bash
npm run preview                # main menu
npm run preview Downloader     # one category
npm run preview -- --json      # the raw interactiveMessage payload
```

Four menu styles, switchable live with `.setmenu` or the panel:

| Style | Command | Description |
|---|---|---|
| **buttons** | `.setmenu buttons` | Quick-reply buttons (default) |
| **carousel** | `.setmenu carousel` | Swipeable cards, one per category |
| **list** | `.setmenu list` | Single-select dropdown |
| **text** | `.setmenu text` | Plain numbered text — works everywhere |

If a recipient's WhatsApp build rejects the rich format, `sendInteractive()` automatically
resends the same content as text, so **nobody ever gets a blank message**.

---

## 📦 Commands

### 🏠 Main
`.menu` `.help` `.allmenu`

### 🧑‍💻 Owner *(22)*
`.owner` `.bc` `.block` `.unblock` `.ban` `.unban` `.banlist` `.join` `.leave`
`.setmode` `.setmenu` `.toggle` `.setname` `.setbio` `.setpp` `.reload`
`.pluginlist` `.restart` `.logout` `.shutdown` `.session` `.premium`
`>` *(eval JS)*  `$` *(run shell)*

### 👥 Group *(25)*
`.groupinfo` `.linkgroup` `.revoke` `.group open|close` `.setdesc` `.setsubject`
`.setppgc` `.ephemeral` `.promote` `.demote` `.kick` `.add` `.tagall` `.hidetag`
`.totag` `.delete` `.antilink` `.warn` `.warnings` `.nsfw` `.welcome` `.goodbye`
`.poll` `.listonline` `.simulate`

### ⬇️ Downloader *(10)*
`.tiktok` `.tiktokmp3` `.instagram` `.facebook` `.twitter` `.yts` `.ytmp3` `.ytmp4`
`.mediafire` `.get`

### 🤖 AI *(6)*
`.ai` `.forget` `.translate` `.imagine` `.summarize` `.chatbot`

### 🛠️ Tools *(15)*
`.qr` `.tourl` `.ss` `.tts` `.calc` `.shortlink` `.fancy` `.base64` `.readmore`
`.getpp` `.getbio` `.save` `.ip` `.tempmail` `.checkmail`

### 🔎 Search *(7)*
`.google` `.gimage` `.wikipedia` `.weather` `.lyrics` `.waifu` `.apk`

### 🎮 Fun *(9)*
`.truth` `.dare` `.dice` `.coin` `.8ball` `.ship` `.joke` `.quote` `.games`

### 🕌 Islamic *(7)*
`.prayertime` `.quran` `.ayatulkursi` `.asmaulhusna` `.qibla` `.islamicquote` `.islamic`

### 🖼️ Sticker *(7)*
`.sticker` `.attp` `.toimg` `.togif` `.tomp3` `.toptt` `.stickermenu`

### ℹ️ Info *(10)*
`.ping` `.runtime` `.botinfo` `.profile` `.listgc` `.listpc` `.script` `.rules`
`.donate` `.state`

> Prefixes `. / ! # ? +` all work. Turn multi-prefix off with `MULTI_PREFIX=false`.

---

## 🌍 Deploy to hosting / VPS

Upload the `whatsapp-bot` folder to your server and run **one command**:

```bash
bash deploy.sh
```

It installs Node 20 + ffmpeg, runs `npm install`, writes `.env` (asks for your number,
generates a random `PANEL_TOKEN`), runs the network doctor, then asks how you want to
keep the bot alive:

| Choice | What it does | Best for |
|---|---|---|
| **1 · PM2** | `pm2 start ecosystem.config.cjs` — auto-restart, logs, `pm2 startup` for reboots | VPS (recommended) |
| **2 · systemd** | installs `deploy/kashif-bot.service`, enables it on boot | Ubuntu/Debian VPS |
| **3 · Docker** | `docker compose up -d --build` with a persistent session volume | any container host |
| **4 · nohup** | plain background process, no extra tools | quick tests |
| **5 · foreground** | runs in your terminal so you see the code immediately | first run |

### Get the pairing code on a headless server

```bash
npm run pair                                          # prints it
curl -s "localhost:3000/api/pairing?token=YOUR_TOKEN" # prints just the code
pm2 logs kashif-bot                                   # or watch the PM2 log
journalctl -u kashif-bot -f                           # or the systemd log
docker logs -f kashif-bot                             # or the container log
```

### Open the control panel from your browser

```
http://YOUR_SERVER_IP:3000/?token=YOUR_PANEL_TOKEN
```

If it does not open, allow the port:

```bash
ufw allow 3000/tcp                                              # Ubuntu/Debian
firewall-cmd --add-port=3000/tcp --permanent && firewall-cmd --reload   # CentOS
```

On cloud VPS (AWS/DO/GCP) also open the port in the **security group / firewall rules**
in the provider's dashboard — that step is outside the server.

### Container hosts

```bash
docker build -t kashif-bot .
docker run -d --name kashif-bot -p 3000:3000 \
  -v kashif-session:/app/sessions --restart unless-stopped kashif-bot
```

`/app/sessions` **must** be a volume — it holds your login credentials. Without it you
will have to re-pair on every restart.

### PaaS (Render / Railway / Fly.io)

`Procfile`, `.node-version`, `deploy/render.yaml` and `deploy/railway.json` are included.
Two things matter:

1. Run it as a **worker/background service**, not a web service. The bot holds one live
   WebSocket to WhatsApp; `numReplicas` / instances must be **1**. Scaling it to 2 will
   get your number logged out.
2. Attach a **persistent disk** mounted at `sessions/`, or every deploy forces a re-pair.

> ⚠️ Free tiers that sleep (Render free, Railway trial, Heroku free is gone) will drop the
> WhatsApp connection whenever the dyno idles. Use a paid/starter plan.

### ⚠️ Shared hosting will NOT work

cPanel-style shared hosting (basic Hostinger/Namecheap/GoDaddy shared plans) kills
long-running processes, has no persistent sockets, and usually no ffmpeg. The bot will
connect, then get killed within minutes, and your number may be flagged for repeated
re-registration.

You need one of: a **VPS** ($3-6/mo — Contabo, Hetzner, DigitalOcean, Vultr), a
**Node PaaS** (Render/Railway/Fly.io starter), **Docker**, or **Termux** on your phone.

---

## 📱 Running on Termux (Android)

This is the easiest way to keep the bot online 24/7 without a PC or VPS.
One command does everything — packages, ffmpeg, `.env`, dependencies, network
diagnosis, and finally the pairing code:

```bash
pkg install -y git
git clone https://github.com/kashifpanhwer/games
cd games/whatsapp-bot
bash scripts/install-termux.sh
```

The installer will:

1. acquire a **wake-lock** so Android does not kill the process
2. link shared storage (`termux-setup-storage`)
3. install `nodejs-lts`, `git`, `ffmpeg`, `python`, `libwebp`
4. create `.env`, **ask for your number**, and randomise `PANEL_TOKEN`
5. run `npm install`
6. run `npm run doctor` and tell you if the network will work
7. start the bot and print your pairing code

### ⚠️ Do this once or Android will kill the bot

| Step | Where |
|---|---|
| **Acquire wakelock** | Termux notification ▸ tap it |
| **Battery ▸ Unrestricted** | Android Settings ▸ Apps ▸ Termux |
| Don't swipe Termux away from recents | until the two above are done |

### Keep it alive after closing Termux

```bash
pkg install -y termux-services
nohup npm run pair > bot.log 2>&1 &     # survives closing the app
tail -f bot.log                         # watch the log
```

Control panel from your phone's browser: **http://localhost:3000/?token=YOUR_TOKEN**

### Termux gotchas

- **IPv6-only mobile networks** — WhatsApp hosts often resolve to IPv6 first and fail.
  Fix: `node --dns-result-order=ipv4first index.js --pair`
- **`ffmpeg` without libwebp** — stickers break. Fix: `pkg uninstall ffmpeg && pkg install ffmpeg libwebp`
- **Number format** — always `923xxxxxxxxx`, never `03xxxxxxxxx`. The installer converts it for you.
- **Storage** — `pkg install termux-api` if you want the bot to read files from `~/storage/shared`

---

## ⚕️ Doctor — "my pairing code is not appearing"

```bash
npm run doctor
```

Runs 16 checks **in the exact order WhatsApp requires them** and tells you which one
breaks, with the fix. It tests the network the same way Baileys does — DNS → TCP →
**TLS handshake** → real WebSocket upgrade to `wss://web.whatsapp.com/ws/chat`:

```
── 1. RUNTIME ─────────────────────────────────────
   ✔ Node.js >= 20            running v22.22.3
── 2. PROJECT FILES ───────────────────────────────
   ✔ node_modules installed   @whiskeysockets/baileys present
   ✔ .env exists              32 keys read
── 3. CONFIGURATION ───────────────────────────────
   ✔ PAIRING_NUMBER valid     +923145396910 (12 digits)
   ⚠ PANEL_TOKEN is still the default — change it
── 4. MEDIA PIPELINE (ffmpeg) ─────────────────────
   ✔ drawtext filter          ✔ libwebp   ✔ libx264
── 5. NETWORK TO WHATSAPP ─────────────────────────
   ✔ DNS: web.whatsapp.com    IPv4: 1, IPv6: 1
   ✔ TCP 57.144.217.32:443    socket established
   ✖ TLS handshake            disconnected before secure TLS connection
── 6. WEB PANEL ───────────────────────────────────
   ✔ port 3000 available

  ❌ 1 check failed — a pairing code CANNOT be issued here.
  A pairing code is issued by WhatsApp's servers, not generated locally.
  Any code produced on a machine that cannot complete TLS to
  web.whatsapp.com will be rejected as invalid by the phone.

  13/16 checks passed
```

**Why the TLS step is the one that matters:** a sandbox or firewall can happily accept
the TCP connection on port 443 and then reset it during the TLS handshake. A port check
says "open"; only the TLS + WebSocket test proves the machine can actually register with
WhatsApp. That is why a code generated on such a machine never works.

If doctor is green, `npm run pair` will print a real code within a few seconds.

---

## 🧩 Advanced features

**Plugin architecture with hot reload** — drop a `.js` file into `plugins/` and it is
picked up. Send `.reload` and the bot re-imports every plugin **without restarting**.
A file may export one plugin or an array of them. The menu builds itself from plugin
metadata, so a new command appears in the right category automatically.

```js
export default {
  name: 'hello',
  aliases: ['hi'],
  category: 'Fun',
  desc: 'Say hello back',
  use: '[name]',
  group: false, admin: false, owner: false, botAdmin: false,
  media: null,        // 'image' | 'video' | 'audio' | 'sticker' | 'quotedMedia'
  limit: 1,           // daily-limit cost
  cooldown: 3,        // seconds per user
  async handler({ m, sock, args, text, isGroup, isOwner }) {
    return m.reply(`Hello ${text || m.pushName || 'there'}! 👋`);
  },
};
```

**Permission engine** — every command declares `owner` / `group` / `private` / `admin` /
`botAdmin` / `nsfw` and the router enforces it before the handler runs. Public/private mode
is a global switch (`.setmode private`).

**JSON database with auto-save** — `src/database.js` wraps user and group records in a
Proxy, so `group.antilink = true` persists on its own. Writes are debounced and atomic
(write to `.tmp`, then rename). A corrupt file is renamed aside and the bot starts fresh
instead of crashing.

**Anti features** — anti-link (3 strikes → remove), anti-delete (restores deleted messages
from an in-memory cache), anti-view-once (re-sends view-once media), anti-call
(auto-reject + warn), welcome/goodbye with profile pictures.

**Daily limits & cooldowns** — per-command cooldown, per-user daily limit, premium users
exempt. `.profile` shows your balance. Resets at midnight automatically.

**Real media pipeline** — a bundled static `ffmpeg` builds 512×512 WebP stickers and injects
the pack EXIF chunk by hand-rolling the RIFF container, so stickers show
*“Kashif Tech”* as the author. Full round trip verified by tests:
`text → PNG → WebP → MP4 → animated WebP`.

**Resilient connection** — exponential-backoff reconnect (2s → 30s cap), `loggedOut`
detection that stops retrying instead of burning your number, QR fallback if pairing fails,
and a custom 8-character pairing code option (`CUSTOM_PAIRING_CODE`).

**Upload provider chain** — `.tourl` tries tmpfiles.org → catbox.moe → uguu.se and returns
whichever answers first, with the TTL shown.

---

## ⚙️ Configuration

Everything lives in `.env` (see `.env.example` for the annotated version).

| Key | Default | Notes |
|---|---|---|
| `BOT_NAME` | `Kashif Tech Advance Bot` | Shown in every menu header |
| `PAIRING_NUMBER` | `923145396910` | Digits only; `0300…` is auto-normalised to `92300…` |
| `OWNER_NUMBER` | `923145396910` | Comma-separated list allowed |
| `AUTH_MODE` | `pair` | `pair` or `qr` |
| `CUSTOM_PAIRING_CODE` | *(empty)* | Exactly 8 chars, `A-Z`/`0-9`, no `I L O U` |
| `PANEL_ENABLED` | `true` | |
| `PANEL_PORT` | `3000` | |
| `PANEL_TOKEN` | `kashiftech` | **Change this** |
| `MENU_TYPE` | `buttons` | `buttons` / `carousel` / `list` / `text` |
| `PREFIX` | `.` | |
| `MULTI_PREFIX` | `true` | Enables `. / ! # ? +` |
| `ANTI_LINK` `ANTI_VIEWONCE` `ANTI_DELETE` `WELCOME` `GOODBYE` `AUTO_TYPING` `AUTO_READ` `NSFW` `PUBLIC_MODE` | see example | Global defaults, overridable per group |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | *(empty)* | Needed for `.ai`, `.summarize` |
| `LIMIT_PER_DAY` | `100` | |
| `COOLDOWN_SECONDS` | `2` | `0` disables all throttling (used by the test suite) |

CLI flags override the env file:

```bash
node index.js --pair                    # force pairing-code mode
node index.js --qr                      # force QR mode
node index.js --pair --number 923001234567
node index.js --panel-only              # dashboard without connecting to WhatsApp
```

---

## 🧪 Testing

```bash
npm test
```

40 checks run against a **mock WhatsApp socket** — no internet, no account, no risk
(except the last one, which really spawns the bot and SIGTERMs it to prove PM2, systemd
and Docker can stop it cleanly):

- plugin loading (zero failures, no duplicate triggers)
- the menu is a real `interactiveMessage`, titled **KASHIF TECH ADVANCE BOT**
- one quick-reply button per category + a `single_select` of every command
- **pressing a category button opens the sub-menu; pressing a command button runs it**
- the text fallback mirrors the button menu
- all six prefixes, unknown-command silence, owner/group/admin gates
- QR generation, calculator (including rejection of unsafe input), Base64, fancy text
- the whole ffmpeg sticker pipeline

```
✅ 40/40 checks passed
Bot ready: 121 plugins · 365 triggers · 11 menu categories
```

---

## 🗂️ Project layout

```
whatsapp-bot/
├── index.js                 entrypoint, CLI flags, graceful shutdown
├── src/
│   ├── config.js            env parsing + number normalisation
│   ├── connection.js        socket lifecycle, pairing/QR, reconnect
│   ├── handler.js           message router, gates, limits, cooldowns
│   ├── plugins.js           plugin registry + hot reload
│   ├── database.js          auto-saving JSON store (Proxy-backed)
│   ├── state.js             live state shared with the panel + SSE
│   ├── panel.js             Express control panel
│   ├── panel.html           dashboard UI
│   ├── group-events.js      welcome / goodbye / promote / demote
│   └── call-events.js       anti-call
├── lib/
│   ├── buttons.js           interactiveMessage builder + fallback
│   ├── converter.js         ffmpeg: stickers, mp3, EXIF/RIFF writer
│   ├── functions.js         helpers + the message serialiser
│   ├── scraper.js           TikTok, YouTube, IG, FB, X, Islamic, translate…
│   ├── uploader.js          tmpfiles / catbox / uguu chain
│   └── anti-features.js     anti-link, anti-delete, anti-view-once
├── plugins/                 11 plugin files → 121 commands
├── scripts/
│   ├── install-termux.sh    one-command Android/Termux setup
│   ├── doctor.mjs           network + config diagnosis (why no code?)
│   ├── preview-menu.mjs     render the button menu offline
│   └── clean-session.js     wipe the session (and optionally the database)
├── deploy/
│   ├── kashif-bot.service   systemd unit template
│   ├── render.yaml          Render blueprint (worker + persistent disk)
│   └── railway.json         Railway config
├── deploy.sh                one-command hosting/VPS setup
├── ecosystem.config.cjs     PM2 process definition
├── Dockerfile               image with ffmpeg + healthcheck + tini
├── docker-compose.yml       compose stack with a persistent session volume
├── Procfile                 PaaS process declaration
└── test/smoke.mjs           offline test harness
```

### npm scripts

| Script | What it does |
|---|---|
| `npm run pair` | Start the bot and print the pairing code |
| `npm run qr` | Start with QR-code login instead |
| `npm run panel` | Web dashboard only, no WhatsApp connection |
| `npm run doctor` | Diagnose config + network + ffmpeg (16 checks) |
| `npm run termux` | Run the Termux installer |
| `bash deploy.sh` | One-command VPS/hosting setup (PM2 / systemd / Docker / nohup) |
| `npm run preview` | Render the button menu offline |
| `npm test` | 40 offline checks against a mock socket |
| `npm run clean` | Delete the session so you can re-pair |

---

## 🛠️ Troubleshooting

**“PAIRING CODE UNAVAILABLE / Connection Closed”**
The process cannot reach `wss://web.whatsapp.com`. This is a network problem, not a code
problem — a pairing code is only valid if WhatsApp's servers actually received the
registration handshake. Check:

- a firewall, proxy, VPN or container network blocking outbound `443` to WhatsApp
- restricted sandboxes / CI runners that only allow a package registry allowlist
- DNS. `curl -v https://web.whatsapp.com` should return an HTTP status, not hang.

Once the host can reach WhatsApp, `npm run pair` prints a real code within a few seconds.

**“Session logged out”** — the credentials were revoked (re-paired elsewhere, or WhatsApp
unlinked the device). Run `npm run clean` and pair again.

**Buttons don't appear for some users** — their WhatsApp build is too old for
`interactiveMessage`. The bot detects the failure and resends the same menu as text.
Or set `.setmenu text` globally.

**Sticker commands fail** — the bundled static ffmpeg is used automatically; confirm with
`node -e "console.log(require('@ffmpeg-installer/ffmpeg').path)"`. On Alpine or armv7 you
may need a system `ffmpeg` on `PATH`.

**Downloaders fail** — they use free public endpoints that get rate-limited or disappear.
Providers are chained and can be swapped in `lib/scraper.js`; pin your own with `YT_API`.

**Port 3000 busy** — set `PANEL_PORT` in `.env`.

---

## ⚠️ Disclaimer

This project is **not affiliated with, endorsed by, or sponsored by WhatsApp / Meta**.
WhatsApp is a trademark of WhatsApp LLC. Automated clients can violate WhatsApp's Terms of
Service and may result in your number being **banned**. Use a number you can afford to lose,
do not spam, and do not use this to harass anyone. You are responsible for how you use it.

---

## 📄 License

MIT — built by **Kashif Tech**.
