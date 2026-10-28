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
| **Tests** | `npm test` → 39 offline checks |

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

39 checks run against a **mock WhatsApp socket** — no internet, no account, no risk:

- plugin loading (zero failures, no duplicate triggers)
- the menu is a real `interactiveMessage`, titled **KASHIF TECH ADVANCE BOT**
- one quick-reply button per category + a `single_select` of every command
- **pressing a category button opens the sub-menu; pressing a command button runs it**
- the text fallback mirrors the button menu
- all six prefixes, unknown-command silence, owner/group/admin gates
- QR generation, calculator (including rejection of unsafe input), Base64, fancy text
- the whole ffmpeg sticker pipeline

```
✅ 39/39 checks passed
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
│   ├── preview-menu.mjs     render the button menu offline
│   └── clean-session.js     wipe the session (and optionally the database)
└── test/smoke.mjs           offline test harness
```

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
