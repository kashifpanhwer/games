# 🎮 Kashif Tech — Projects

| Folder | What it is |
|---|---|
| **[`whatsapp-bot/`](whatsapp-bot)** | ⚡ **Kashif Tech Advance Bot** — an advanced multi-device WhatsApp bot with pairing-code login, a native button menu, 121 plugins and a live web control panel |
| [`click-the-box/`](click-the-box/index.html) | A small "Click the Box" browser game |

---

## ⚡ Kashif Tech Advance Bot

The main project in this repository. Full documentation lives in
**[`whatsapp-bot/README.md`](whatsapp-bot/README.md)**.

```bash
cd whatsapp-bot
npm install
cp .env.example .env     # set PAIRING_NUMBER, OWNER_NUMBER, PANEL_TOKEN
npm run pair             # prints your 8-character WhatsApp pairing code
npm test                 # 39 offline checks against a mock socket
```

**Highlights**

- 🔑 **Pairing-code login** — no QR scan; link the bot with an 8-character code
- 🎛️ **Native button menu** — `interactiveMessage` + `nativeFlowMessage`, with automatic
  text fallback, plus carousel / list / text styles switchable live
- 🧩 **121 plugins · 365 command triggers · 11 categories** — hot-reloadable with `.reload`
- 🌐 **Web control panel** — live pairing code, QR, SSE log stream, remote restart
- 🛡️ **Anti-link, anti-delete, anti-view-once, anti-call**, welcome/goodbye
- 🖼️ **Real ffmpeg media pipeline** — 512×512 WebP stickers with hand-written EXIF/RIFF
- 🔌 **AI, downloaders, Islamic tools, search, fun, group admin** command sets
- 🧪 **Fully testable offline** — the test suite never touches the network

> ⚠️ Automated WhatsApp clients can violate WhatsApp's Terms of Service and may get your
> number banned. Use a number you can afford to lose.

---

## 🎮 Click the Box

A single-file browser game — open [`click-the-box/index.html`](click-the-box/index.html)
and click the red box to score.
