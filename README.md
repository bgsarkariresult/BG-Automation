# BG Automation Dashboard

Hindi mobile-friendly dashboard for GitHub Actions automation, live workflow status, logs, websites, YouTube projects and Telegram activity.

## Pages

- `index.html` — Main dashboard
- `control.html` — Actions Control: run workflows, rerun failed jobs, live logs and dashboard sync
- `logs.html` — Live logs / Telegram activity
- `sites.html` — Websites / projects
- `youtube.html` — YouTube channels
- `trending.html` — Trending topics
- `reports.html` — Reports
- `app.css` / `theme.css` — Dashboard styling
- `app.js` — Shared boot, data loading and notifications
- `sw.js` — PWA service worker and notification click handling
- `manifest.json` — PWA install metadata
- `cloudflare/live-worker.js` — Live GitHub Actions API proxy
- `sync.py` — Dashboard data synchronisation

## Data flow

The dashboard reads the public `data/dashboard.json` for channels/sites/history and also requests the Cloudflare Live API for current GitHub Actions status. The Live Worker keeps the GitHub token server-side.

The browser does **not** need a GitHub PAT to display or run workflows. Actions are dispatched through the Cloudflare Worker.

## Notifications

The dashboard registers `sw.js` and uses the service worker's `showNotification()` instead of calling `new Notification()` directly. This is more suitable for Android/PWA notifications.

Important: this is still **client polling**, not true Web Push. A closed app cannot discover a new GitHub run merely from browser polling. True background notifications require a server-side event/push path.

## Polling

Dashboard status polling is intentionally throttled to about **45 seconds** while the page is visible. Hidden tabs stop polling and refresh when they become visible again.

## Security

- Never put a GitHub PAT in HTML, JavaScript, `localStorage`, `sessionStorage`, or public JSON.
- Use a fine-grained GitHub token with only the repositories and permissions required by the Cloudflare Worker.
- `data/dashboard.json` is public because this repository/GitHub Pages site is public. Do **not** put private Telegram messages, secrets, phone numbers, or other sensitive data in that file.
- The current Live API uses an allowed browser origin check, which is **CORS protection, not authentication**. Anyone who can call the Worker directly may be able to read its returned status. If workflow status must be private, put the Worker behind Cloudflare Access or another real authentication layer.
- The Actions Control page stores only the optional Worker PIN locally; it does not store a GitHub PAT.

## Deployment

GitHub Pages serves the static dashboard from the repository. The Cloudflare Worker is deployed separately and must have its GitHub token configured as a Worker secret (for example `GH_TOKEN`).

After changing the Worker, purge/refresh its cache as appropriate. Browser/PWA users may need to reload once after a service-worker update.
