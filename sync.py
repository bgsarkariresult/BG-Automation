"""GitHub Actions me chalta hai. Secrets: YT_API_KEY, GH_PAT (optional). Output: data/dashboard.json"""
import os, re, json, datetime as dt, urllib.request, urllib.parse
from email.utils import parsedate_to_datetime


def get(url, h=None, raw=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=h or {}), timeout=30) as f:
        b = f.read().decode("utf-8", "replace")
        return b if raw else json.loads(b)


cfg = json.load(open("config.json", encoding="utf-8"))
os.makedirs("data", exist_ok=True)
NOW = dt.datetime.utcnow()
now = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")
P = lambda s: dt.datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")

# --- Telegram messages (notify.py -> repository_dispatch) ---
mp = "data/messages.json"
msgs = json.load(open(mp, encoding="utf-8")) if os.path.exists(mp) else []
text = os.environ.get("MSG_TEXT", "").strip()
if text:
    msgs = ([{"t": now, "text": text[:1000]}] + msgs)[:50]
    json.dump(msgs, open(mp, "w", encoding="utf-8"), ensure_ascii=False)

# --- YouTube channels ---
key = os.environ.get("YT_API_KEY", "")
YT = "https://www.googleapis.com/youtube/v3/"
channels = []
ids = [c["id"] for c in cfg["channels"] if c.get("id")]
if key and ids:
    q = urllib.parse.urlencode({"part": "snippet,statistics,contentDetails", "id": ",".join(ids), "key": key})
    found = {i["id"]: i for i in get(YT + "channels?" + q).get("items", [])}
    for c in cfg["channels"]:
        it = found.get(c["id"])
        if not it:
            channels.append({"name": c["name"], "id": c["id"], "error": "Channel ID galat ya nahi mila"})
            continue
        s, latest = it["statistics"], []
        try:
            up = it["contentDetails"]["relatedPlaylists"]["uploads"]
            pl = get(YT + "playlistItems?" + urllib.parse.urlencode(
                {"part": "snippet", "playlistId": up, "maxResults": 5, "key": key})).get("items", [])
            vid_ids = [v["snippet"]["resourceId"]["videoId"] for v in pl]
            vs = {v["id"]: v["statistics"] for v in get(YT + "videos?" + urllib.parse.urlencode(
                {"part": "statistics", "id": ",".join(vid_ids), "key": key})).get("items", [])}
            for v in pl:
                sn = v["snippet"]; vid = sn["resourceId"]["videoId"]
                latest.append({"title": sn["title"], "id": vid, "date": sn["publishedAt"][:10],
                               "views": vs.get(vid, {}).get("viewCount")})
        except Exception:
            pass
        channels.append({"name": c["name"], "id": c["id"], "icon": it["snippet"]["thumbnails"]["default"]["url"],
                         "subs": s.get("subscriberCount"), "views": s.get("viewCount"),
                         "videos": s.get("videoCount"), "latest": latest})

# --- Bots: runs, failed step, next schedule ---
hdr = {"Accept": "application/vnd.github+json"}
if os.environ.get("GH_PAT"):
    hdr["Authorization"] = "Bearer " + os.environ["GH_PAT"]


def cron_next(expr):
    m, h, _, _, dow = expr.split()[:5]
    def ok(f, v):
        return any(p == "*" or (p.startswith("*/") and v % int(p[2:]) == 0) or (p.isdigit() and int(p) == v)
                   for p in f.split(","))
    t = NOW.replace(second=0, microsecond=0)
    for _ in range(10080):
        t += dt.timedelta(minutes=1)
        if ok(m, t.minute) and ok(h, t.hour) and ok(dow, (t.weekday() + 1) % 7):
            return t.strftime("%Y-%m-%dT%H:%M:%SZ")


bots = []
for b in cfg["bots"]:
    row = {k: b.get(k, "") for k in ("name", "repo", "workflow", "site", "tag", "cost")}
    row["kind"] = b.get("kind") or ("video" if b.get("workflow") and "trending" not in b["repo"].lower() else "other")
    row.update(status="unknown", runs=[])
    base = "https://api.github.com/repos/%s/actions/" % b["repo"]
    try:
        u = base + ("workflows/%s/runs" % b["workflow"] if b.get("workflow") else "runs") + "?per_page=100"
        for r in get(u, hdr).get("workflow_runs", []):
            d = 0
            try:
                d = int((P(r["updated_at"]) - P(r["run_started_at"])).total_seconds())
            except Exception:
                pass
            row["runs"].append({"id": r["id"], "s": r.get("conclusion") or r.get("status"), "t": r["updated_at"],
                                "d": d, "e": r.get("event"), "n": r.get("display_title") or r.get("name"),
                                "u": r["html_url"]})
        if row["runs"]:
            r0 = row["runs"][0]
            row.update(status=r0["s"], time=r0["t"], url=r0["u"])
    except Exception:
        pass
    f = next((r for r in row["runs"][:5] if r["s"] == "failure"), None)
    if f:
        try:
            for j in get(base + "runs/%s/jobs" % f["id"], hdr).get("jobs", []):
                for s_ in j.get("steps", []):
                    if s_.get("conclusion") == "failure":
                        row["failed"] = {"job": j["name"], "step": s_["name"], "url": f["u"], "t": f["t"]}
                        break
        except Exception:
            pass
    if b.get("workflow"):
        try:
            y = get("https://api.github.com/repos/%s/contents/.github/workflows/%s" % (b["repo"], b["workflow"]),
                    {**hdr, "Accept": "application/vnd.github.raw+json"}, raw=True)
            c = re.search(r"cron:\s*['\"]([^'\"]+)['\"]", y)
            if c:
                row["cron"], row["next"] = c.group(1), cron_next(c.group(1))
        except Exception:
            pass
    bots.append(row)


# --- Websites: article monitor (sitemap.xml / rss / atom) ---
def dday(s):
    m = re.search(r"\d{4}-\d{2}-\d{2}", s or "")
    if m:
        return m.group(0)
    try:
        return parsedate_to_datetime(s).strftime("%Y-%m-%d")
    except Exception:
        return ""


sites = []
for s in cfg.get("sites", []):
    row = {"name": s["name"], "url": s["url"], "articles": [], "days": {}, "total": 0}
    try:
        x = get(s["feed"], raw=True)
        arts = []
        for _, it in re.findall(r"<(url|entry|item)\b[^>]*>(.*?)</\1>", x, re.S):
            m = re.search(r"<loc>\s*(.*?)\s*</loc>|<link[^>]*href=\"([^\"]+)\"|<link>\s*(.*?)\s*</link>", it, re.S)
            if not m:
                continue
            url = next(g for g in m.groups() if g)
            t = re.search(r"<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", it, re.S)
            d = re.search(r"<(?:lastmod|updated|published|pubDate)>(.*?)</", it, re.S)
            arts.append({"t": (t.group(1).strip() if t else url.rstrip("/").split("/")[-1].replace("-", " ")),
                         "u": url, "d": dday(d.group(1) if d else "")})
        arts.sort(key=lambda a: a["d"], reverse=True)
        row["total"] = len(arts)
        for a in arts:
            if a["d"]:
                row["days"][a["d"]] = row["days"].get(a["d"], 0) + 1
        row["articles"] = arts[:12]
    except Exception:
        row["error"] = "feed nahi mila — config.json me sahi sitemap.xml / rss URL daalo"
    sites.append(row)

json.dump({"updated": now, "channels": channels, "bots": bots, "sites": sites,
          "websites": cfg.get("websites", []), "messages": msgs},
          open("data/dashboard.json", "w", encoding="utf-8"), ensure_ascii=False)
