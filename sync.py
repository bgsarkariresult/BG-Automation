"""Runs inside GitHub Actions. Secrets: YT_API_KEY, GH_PAT (optional). Writes data/dashboard.json."""
import os, json, datetime, urllib.request, urllib.parse


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as f:
        return json.load(f)


cfg = json.load(open("config.json", encoding="utf-8"))
os.makedirs("data", exist_ok=True)
now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

# --- Telegram messages (added when notify.py sends a repository_dispatch) ---
mp = "data/messages.json"
msgs = json.load(open(mp, encoding="utf-8")) if os.path.exists(mp) else []
text = os.environ.get("MSG_TEXT", "").strip()
if text:
    msgs.insert(0, {"t": now, "text": text[:1000]})
    msgs = msgs[:50]
    json.dump(msgs, open(mp, "w", encoding="utf-8"), ensure_ascii=False)

# --- YouTube channels (one API key for all channels) ---
key = os.environ.get("YT_API_KEY", "")
channels = []
ids = [c["id"] for c in cfg["channels"] if c.get("id")]
if key and ids:
    q = urllib.parse.urlencode({"part": "snippet,statistics,contentDetails", "id": ",".join(ids), "key": key})
    found = {i["id"]: i for i in get("https://www.googleapis.com/youtube/v3/channels?" + q).get("items", [])}
    for c in cfg["channels"]:
        it = found.get(c["id"])
        if not it:
            channels.append({"name": c["name"], "id": c["id"], "error": "Channel ID galat ya nahi mila"})
            continue
        s = it["statistics"]
        latest = []
        try:
            up = it["contentDetails"]["relatedPlaylists"]["uploads"]
            q = urllib.parse.urlencode({"part": "snippet", "playlistId": up, "maxResults": 3, "key": key})
            for v in get("https://www.googleapis.com/youtube/v3/playlistItems?" + q).get("items", []):
                sn = v["snippet"]
                latest.append({"title": sn["title"], "id": sn["resourceId"]["videoId"], "date": sn["publishedAt"][:10]})
        except Exception:
            pass
        channels.append({
            "name": c["name"], "id": c["id"],
            "icon": it["snippet"]["thumbnails"]["default"]["url"],
            "subs": s.get("subscriberCount"), "views": s.get("viewCount"),
            "videos": s.get("videoCount"), "latest": latest,
        })

# --- Bot workflow status ---
hdr = {"Accept": "application/vnd.github+json"}
if os.environ.get("GH_PAT"):
    hdr["Authorization"] = "Bearer " + os.environ["GH_PAT"]
bots = []
for b in cfg["bots"]:
    row = {"name": b["name"], "repo": b["repo"], "workflow": b.get("workflow", ""), "site": b.get("site", ""),
           "tag": b.get("tag", ""), "status": "unknown", "runs": []}
    try:
        base = "https://api.github.com/repos/%s/actions/" % b["repo"]
        u = base + ("workflows/%s/runs" % b["workflow"] if b.get("workflow") else "runs") + "?per_page=3"
        runs = get(u, hdr).get("workflow_runs", [])
        row["runs"] = [{"title": r.get("display_title") or r.get("name"), "status": r.get("conclusion") or r.get("status"),
                        "time": r.get("updated_at"), "url": r.get("html_url")} for r in runs]
        if runs:
            row.update(status=row["runs"][0]["status"], time=row["runs"][0]["time"], url=row["runs"][0]["url"])
    except Exception:
        pass
    bots.append(row)

json.dump({"updated": now, "channels": channels, "websites": cfg.get("websites", []), "bots": bots, "messages": msgs},
          open("data/dashboard.json", "w", encoding="utf-8"), ensure_ascii=False)
