# BG Automation Live API (Cloudflare Worker)

Source: `cloudflare/live-worker.js`

## Deploy
1. In Cloudflare Dashboard, open **Workers & Pages** and create a Worker named `bg-automation-live`.
2. Paste the contents of `cloudflare/live-worker.js` into its editor and deploy.
3. In Worker **Settings → Variables and Secrets**, add secret `GH_TOKEN`.
   Use a fine-grained GitHub PAT with **Actions: Read-only** access to every repository listed in `config.json`. Do not put this token in the website or commit it.
4. Add plain-text variable `ALLOWED_ORIGIN` with value `https://bgsarkariresult.github.io`.
5. Test `https://<your-worker-name>.<your-account>.workers.dev/api/status`. It should return JSON with `ok: true`, `updated`, and `bots`.

## Notes
- This endpoint reads the configured repositories' latest Actions runs directly from GitHub.
- Responses are cached for 15 seconds to reduce GitHub API usage.
- Existing `data/dashboard.json`, GitHub Actions sync, and current dashboard pages are unchanged.
- The dashboard's existing **Run Sync** action remains separate. Once the Worker URL is known, the frontend can be connected to this GET endpoint without replacing the existing POST sync Worker.
- GitHub Actions status is near-live, not a WebSocket stream; refresh intervals and GitHub API limits still apply.
