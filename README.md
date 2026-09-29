# BG Control Dashboard

GitHub Pages pe host karne wala **single-page dashboard** for aapke bots & video generators.

## Supported Bots (exact workflows)

| Bot | Repo | Workflow | Input |
|-----|------|----------|-------|
| SG-News18 | bgsarkariresult/SG-News18 | `news-bot.yml` | `article_url` |
| TechGlow India | bgsarkariresult/TechGlow-India | `tech-review-bot.yml` | `article_url` |
| BG Reels Bot | bgtechlab/BG-Reels-Bot | `reels-bot.yml` | `product_url` |
| Trending Finder | bgtechlab/Trending-Topic-Finder | `daily-auto-run.yml` | (none) |
| BG Sarkari Result | bgsarkariresult/bgsarkariresult | site only | — |
| BG Tech | bgtechlab/bgtech | site only | — |

> Note: `Bk-growup` aur `youtube-live-bot` abhi GitHub pe 404 / missing hain.

## Features

- 🔑 GitHub PAT → browser **localStorage** only (code me nahi)
- 🤖 Bot cards: naam, last run, status badge
- 🎬 **Link डालो → Video बनाएँ** (sahi `workflow_dispatch` inputs)
- 🔥 Trending topics (history.json se try + demo)
- 📜 Run history (localStorage) + log box
- ↻ Status fetch (GitHub Actions runs API)
- Daily runs counter

## Deploy on GitHub Pages

1. Naya repo banao (e.g. `bg-dashboard`) ya existing me daal do
2. `index.html` root me rakho
3. **Settings → Pages → Source**: Deploy from branch → `main` / root
4. Site open karo → **Set Token** (PAT with `repo` + `workflow` scope)
5. Bot select → Link paste → Video बनाएँ

## PAT Permissions

Classic token:
- `repo` (full)
- `workflow`

Fine-grained:
- Repository access: selected repos
- Permissions: Actions (Read & write), Contents (Read)

## CORS note

Browser se seedha `api.github.com` kabhi-kabhi CORS block karta hai. Agar aaye:
- Cloudflare Worker / small proxy use karo, **ya**
- GitHub Actions tab se bhi manual run kar sakte ho

## File structure

```
bg-dashboard/
├── index.html   ← pure dashboard (HTML + CSS + JS)
└── README.md
```
