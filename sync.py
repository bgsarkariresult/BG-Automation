"""GitHub Actions me chalta hai. Secrets: YT_API_KEY, GH_PAT (optional). Output: data/dashboard.json"""
import os, re, json, html, datetime as dt, urllib.request, urllib.parse
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
try:
    with open(mp, encoding="utf-8") as f:
        msgs = json.load(f)
    if not isinstance(msgs, list):
        raise SystemExit(mp + " खराब है (list नहीं) - कुछ भी save नहीं किया")
except FileNotFoundError:
    msgs = []
except ValueError:
    raise SystemExit(mp + " खराब JSON है - कुछ भी save नहीं किया")

text = os.environ.get("MSG_TEXT", "").strip()
if text:
    msgs = ([{"t": now, "text": text[:1000]}] + msgs)[:50]

# Keep Telegram messages in their own persistent file so other dashboard
# sync jobs cannot accidentally erase them.
def save_json(path, data):
    """पहले temp file, फिर replace: आधी लिखी file कभी save नहीं होती"""
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(path + ".tmp", path)


# --- YouTube channels ---
key = os.environ.get("YT_API_KEY", "")
YT = "https://www.googleapis.com/youtube/v3/"
channels = []
real_id = lambda i: bool(re.fullmatch(r"UC[\w-]{22}", i or ""))
ids = [c["id"] for c in cfg["channels"] if real_id(c.get("id"))]
try:
    with open("data/dashboard.json", encoding="utf-8") as _f:
        prev = json.load(_f)
except Exception:
    prev = {}
prev_channels = prev.get("channels") or []
prev_bots = {(b.get("repo"), b.get("workflow") or ""): b for b in prev.get("bots") or []}
prev_sites = {s.get("name"): s for s in prev.get("sites") or []}
prev_by_id = {p["id"]: p for p in prev_channels if p.get("id") and not p.get("error")}
is_count = lambda v: str(v).isdigit()
found = None  # None = API से जवाब नहीं मिला
try:
    if key and ids:
        q = urllib.parse.urlencode({"part": "snippet,statistics,contentDetails", "id": ",".join(ids), "key": key})
        found = {i["id"]: i for i in get(YT + "channels?" + q).get("items", [])}
except Exception as e:
    print("YouTube API error:", e)

for c in cfg["channels"]:
    cid = c.get("id") or ""
    if not real_id(cid):
        channels.append({"name": c["name"], "id": "", "error": "Channel ID अभी config.json में नहीं डाली गई"})
        continue
    old = prev_by_id.get(cid)
    # जवाब न मिले या अधूरा हो तो पिछला सही data ही रखें
    keep = dict(old, name=c["name"], stale=True) if old else None
    it = (found or {}).get(cid)
    if not it:
        msg = "YouTube से data अभी नहीं मिला" if found is None else "Channel ID galat ya nahi mila"
        channels.append(keep or {"name": c["name"], "id": cid, "error": msg})
        continue
    try:
        s = it["statistics"]
        row = {"name": c["name"], "id": cid, "icon": it["snippet"]["thumbnails"]["default"]["url"],
               "subs": s.get("subscriberCount"), "views": s.get("viewCount"), "videos": s.get("videoCount")}
        if not (is_count(row["views"]) and is_count(row["videos"])
                and (s.get("hiddenSubscriberCount") or is_count(row["subs"]))):
            raise ValueError("अधूरे आँकड़े")
    except Exception as e:
        print("channel data invalid:", c["name"], e)
        channels.append(keep or {"name": c["name"], "id": cid, "error": "YouTube से अधूरा data मिला"})
        continue
    latest = []
    try:
        up = it["contentDetails"]["relatedPlaylists"]["uploads"]
        pl = get(YT + "playlistItems?" + urllib.parse.urlencode(
            {"part": "snippet", "playlistId": up, "maxResults": 5, "key": key})).get("items", [])
        if not pl and int(row["videos"]) > 0:
            raise ValueError("video list खाली मिली")
        vid_ids = [v["snippet"]["resourceId"]["videoId"] for v in pl]
        vs = {v["id"]: v["statistics"] for v in get(YT + "videos?" + urllib.parse.urlencode(
            {"part": "statistics", "id": ",".join(vid_ids), "key": key})).get("items", [])}
        for v in pl:
            sn = v["snippet"]; vid = sn["resourceId"]["videoId"]
            latest.append({"title": sn["title"], "id": vid, "date": sn["publishedAt"][:10],
                           "views": vs.get(vid, {}).get("viewCount")})
    except Exception as e:
        print("latest videos error:", c["name"], e)
        latest = (old or {}).get("latest", [])
    row["latest"] = latest
    channels.append(row)

# --- Bots: runs, failed step, next schedule ---
hdr = {"Accept": "application/vnd.github+json"}
token = os.environ.get("GH_PAT") or os.environ.get("GH_TOKEN", "")
if token:
    hdr["Authorization"] = "Bearer " + token


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
    row["kind"] = b.get("kind") or "other"
    row.update(status="unknown", runs=[])
    base = "https://api.github.com/repos/%s/actions/" % b["repo"]
    try:
        u = base + ("workflows/%s/runs" % b["workflow"] if b.get("workflow") else "runs") + "?per_page=100"
        found_runs = get(u, hdr).get("workflow_runs")
        old_runs = (prev_bots.get((b["repo"], b.get("workflow") or "")) or {}).get("runs")
        if not isinstance(found_runs, list) or (not found_runs and old_runs):
            raise ValueError("GitHub से खाली/गलत जवाब मिला")
        for r in found_runs:
            d = 0
            try:
                d = int((P(r["updated_at"]) - P(r["run_started_at"])).total_seconds())
            except Exception:
                pass
            row["runs"].append({"id": r["id"], "number": r.get("run_number"),
                                "s": r.get("conclusion") or r.get("status"), "t": r.get("updated_at"),
                                "started": r.get("run_started_at"), "created": r.get("created_at"),
                                "d": d, "e": r.get("event"), "n": r.get("display_title") or r.get("name"),
                                "branch": r.get("head_branch"), "actor": (r.get("actor") or {}).get("login"),
                                "u": r.get("html_url")})
        if row["runs"]:
            r0 = row["runs"][0]
            row.update(status=r0["s"], time=r0["t"], url=r0["u"],
                       last_run_id=r0["id"], run_number=r0.get("number"),
                       branch=r0.get("branch"), event=r0.get("e"),
                       actor=r0.get("actor"), html_url=r0["u"])
    except Exception as e:
        # API fail ho to pichla data rakho, khali mat karo
        old = prev_bots.get((b["repo"], b.get("workflow") or ""))
        if old:
            row.update({k: v for k, v in old.items() if k not in ("name", "repo", "workflow", "site", "tag", "cost", "kind")})
        row["api_error"] = str(e)[:300]
    # "failed" sirf tab, jab sabse naya pura hua run fail ho (purani galti nahi)
    f = next((r for r in row["runs"] if r["s"] in ("success", "failure", "timed_out", "startup_failure")), None)
    if "api_error" not in row and f and f["s"] != "success":
        try:
            for j in get(base + "runs/%s/jobs" % f["id"], hdr).get("jobs", []):
                for s_ in j.get("steps", []):
                    if s_.get("conclusion") in ("failure", "timed_out"):
                        row["failed"] = {"job": j["name"], "step": s_["name"],
                                         "message": "Workflow step failed: " + s_["name"],
                                         "url": f["u"], "t": f["t"], "run_id": f["id"]}
                        break
        except Exception as e:
            row["failure_lookup_error"] = str(e)[:250]
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


def real_date(d):
    """सिर्फ़ असली तारीख़ (भविष्य की नहीं); वरना खाली"""
    try:
        x = dt.datetime.strptime(d, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return ""
    return d if x <= (NOW + dt.timedelta(hours=5, minutes=30)).date() else ""


def page_title(url, fallback):
    try:
        m = re.search(r"<title[^>]*>(.*?)</title>", get(url, raw=True), re.I | re.S)
        t = " ".join(html.unescape(m.group(1)).split()) if m else ""
        return t or fallback
    except Exception:
        return fallback


sites = []
for s in cfg.get("sites", []):
    row = {"name": s["name"], "url": s["url"], "articles": [], "days": {}, "total": 0}
    try:
        name = s["name"].lower()
        # Read the site's real content database where available; sitemap lastmod
        # may describe a rebuild rather than the article publication date.
        if "sg news" in name:
            base = s["feed"].split("/sitemap.xml")[0]
            data = get(base + "/data/news.json")
            if not isinstance(data, list):
                raise ValueError("news.json का format गलत है")
            arts = []
            for a in data:
                if not isinstance(a, dict) or a.get("id") in (None, ""):
                    continue
                date = str(a.get("publishedDate") or a.get("date") or "")
                parsed = re.search(r"\d{4}-\d{2}-\d{2}", date)
                if not parsed:
                    months = {"जनवरी":"01","फ़रवरी":"02","फरवरी":"02","मार्च":"03","अप्रैल":"04","मई":"05","जून":"06","जुलाई":"07","अगस्त":"08","सितंबर":"09","अक्टूबर":"10","नवंबर":"11","दिसंबर":"12"}
                    m = re.search(r"(\d{1,2})\s+([^\s]+)\s+(\d{4})", date)
                    if m and m.group(2) in months:
                        date = f'{m.group(3)}-{months[m.group(2)]}-{int(m.group(1)):02d}'
                    else:
                        date = ""
                else:
                    date = parsed.group(0)
                arts.append({"t": a.get("title") or "शीर्षक उपलब्ध नहीं", "u": base + "/article.html?id=" + str(a.get("id")), "d": date})
        elif "techglow" in name:
            base = s["feed"].split("/sitemap.xml")[0]
            data = get(base + "/data/products.json")
            if not isinstance(data, list):
                raise ValueError("products.json का format गलत है")
            arts = []
            for a in data:
                if not isinstance(a, dict) or not a.get("id"):
                    continue
                arts.append({"t": a.get("title") or a.get("short_name") or "शीर्षक उपलब्ध नहीं",
                             "u": base + "/products/" + str(a.get("id", "")) + "/",
                             "d": dday(str(a.get("date") or ""))})
        else:
            x = get(s["feed"], raw=True)
            arts = []
            for _, it in re.findall(r"<(url|entry|item)\b[^>]*>(.*?)</\1>", x, re.S):
                m = re.search(r"<loc>\s*(.*?)\s*</loc>|<link[^>]*href=\"([^\"]+)\"|<link>\s*(.*?)\s*</link>", it, re.S)
                if not m:
                    continue
                url = next(g for g in m.groups() if g)
                if url.rstrip("/") == s["url"].rstrip("/"):
                    continue
                t = re.search(r"<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", it, re.S)
                d = re.search(r"<(?:lastmod|updated|published|pubDate)>(.*?)</", it, re.S)
                arts.append({"t": (t.group(1).strip() if t else re.sub(r"\.html?$", "", url.rstrip("/").split("/")[-1]).replace("-", " ")),
                             "slug": not t,
                             "u": url, "d": dday(d.group(1) if d else "")})
        # Remove home pages and duplicate URLs; never count a sitemap rebuild date as an article.
        unique = {}
        for a in arts:
            if a["u"].rstrip("/") == s["url"].rstrip("/"):
                continue
            unique[a["u"]] = a
        arts = list(unique.values())
        if not arts and (prev_sites.get(s["name"]) or {}).get("total"):
            raise ValueError("feed से एक भी article नहीं मिला")
        for a in arts:
            a["d"] = real_date(a["d"])
        arts.sort(key=lambda a: (a["d"] or "", a["u"]), reverse=True)
        row["total"] = len(arts)
        for a in arts:
            if a["d"]:
                row["days"][a["d"]] = row["days"].get(a["d"], 0) + 1
        for a in arts[:10]:
            if a.pop("slug", False):
                a["t"] = page_title(a["u"], a["t"])
        for a in arts:
            a.pop("slug", None)
        row["articles"] = arts[:10]
    except Exception as e:
        row.update(prev_sites.get(s["name"], {}))
        row["error"] = ("feed/data nahi mila: " + str(e))[:300]
    sites.append(row)

out = {"updated": now, "checked_at": now, "refresh_interval_seconds": 300,
       "source": "GitHub Actions API", "channels": channels, "bots": bots, "sites": sites,
       "websites": cfg.get("websites", []), "messages": msgs}
# आख़िरी जाँच: config से मेल न खाए तो कुछ भी save न करें
if (len(channels), len(bots), len(sites)) != (len(cfg["channels"]), len(cfg["bots"]), len(cfg.get("sites", []))):
    raise SystemExit("data अधूरा है - कुछ भी save नहीं किया")
save_json(mp, msgs[:50])
save_json("data/dashboard.json", out)
