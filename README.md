# BG Automation Dashboard v2.0

Advanced multi-page YouTube + GitHub + Telegram automation dashboard.

## Features
- **Dashboard** — Overview with stats, channels, websites, live logs
- **YouTube Channels** — Manage unlimited channels
- **Websites / Projects** — SG News18, BG Tech, BG Sarkari Job
- **Automation Jobs** — View success/fail status
- **Article Generator** — Link → Article via GitHub Actions
- **Video Library** — Uploaded videos tracking
- **Telegram Messages** — Incoming bot messages
- **Live Logs** — Real-time activity feed
- **Settings** — GitHub Secrets status

## Deploy to GitHub Pages
1. Upload this folder content to your repo root (or `/docs`)
2. Settings → Pages → Deploy from branch → main / root
3. Open the site

## Structure
```
bg-automation/
├── index.html          # Dashboard
├── css/style.css
├── js/app.js
└── pages/
    ├── youtube.html
    ├── websites.html
    ├── jobs.html
    ├── article.html
    ├── videos.html
    ├── telegram.html
    ├── logs.html
    └── settings.html
```

All tokens load from **GitHub Secrets** — no need to enter in browser.
