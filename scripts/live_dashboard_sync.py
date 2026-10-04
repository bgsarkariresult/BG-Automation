#!/usr/bin/env python3
import json, os, re
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.parse import urljoin
import xml.etree.ElementTree as ET

FILE="data/dashboard.json"
TOKEN=os.environ.get("GITHUB_TOKEN","")
HEAD={"User-Agent":"BG-Automation-Live-Dashboard/1.0","Accept":"*/*"}
if TOKEN: HEAD["Authorization"]="Bearer "+TOKEN
IST=timezone(timedelta(hours=5,minutes=30))
TODAY=datetime.now(timezone.utc).astimezone(IST).date()

SITES=[
 ("BG Sarkari Result","https://bgsarkariresult.github.io/bgsarkariresult/","/jobs/"),
 ("SG News18","https://bgnewswab.github.io/sgnewswab/index.html","/article.html"),
 ("TechGlow India","https://bgtechlab.github.io/bgtech/index.html","/products/")
]
REPOS=[
 "bgsarkariresult/SG-News18","bgsarkariresult/TechGlow-India",
 "bgsarkariresult/Bk-growup-","bgsarkariresult/bgsarkariresult",
 "bgsarkariresult/youtube-live-bot","bgtechlab/bgtech",
 "bgtechlab/Trending-Topic-Finder","bgtechlab/BG-Reels-Bot",
 "bgtechlab/Job-Page-Auto-Publisher","bgtechlab/amazon_to_blogger",
 "bgtechlab/News-Blog-Auto-Publisher"
]

def get(url,accept=None):
 h=dict(HEAD)
 if accept: h["Accept"]=accept
 with urlopen(Request(url,headers=h),timeout=20) as r: return r.read()

def dt(s):
 if not s:return None
 try:
  x=s.strip().replace("Z","+00:00"); d=datetime.fromisoformat(x)
  return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(IST)
 except:return None

def title(url):
 try:
  s=get(url,"text/html").decode("utf-8","ignore")[:800000]
  m=re.search(r"<title[^>]*>(.*?)</title>",s,re.I|re.S)
  t=re.sub(r"\\s+"," ",re.sub("<[^>]+>"," ",m.group(1))).strip() if m else url
  for p in [r'property=["\']article:published_time["\'][^>]+content=["\']([^"\']+)',r'name=["\']date["\'][^>]+content=["\']([^"\']+)',r'"datePublished"\\s*:\\s*"([^"]+)"']:
   m=re.search(p,s,re.I)
   if m and dt(m.group(1)): return t,dt(m.group(1))
  return t,None
 except:return url,None

def sitemap(base,pattern):
 out=[]; seen=set()
 def read(u,depth=0):
  if u in seen or depth>2:return
  seen.add(u)
  try:r=ET.fromstring(get(u,"application/xml,text/xml"))
  except:return
  if r.tag.lower().endswith("sitemapindex"):
   for n in r.iter():
    if n.tag.lower().endswith("loc") and n.text: read(n.text.strip(),depth+1)
  else:
   for n in r:
    loc=lm=None
    for c in n:
     if c.tag.lower().endswith("loc"):loc=(c.text or "").strip()
     elif c.tag.lower().endswith("lastmod"):lm=dt(c.text or "")
    if loc and pattern in loc:out.append((loc,lm))
 read(urljoin(base.rstrip("/")+"/","sitemap.xml"))
 if not out: read(urljoin(base.rstrip("/")+"/","sitemap_index.xml"))
 return list(dict.fromkeys(out))

def sync_site(name,url,pattern):
 rows=sitemap(url,pattern)
 result=[]
 for u,last in rows[:80]:
  t,pd=title(u); d=last or pd
  if d: result.append((d,t,u))
 result.sort(reverse=True)
 days={}
 for d,t,u in result: days[d.date().isoformat()]=days.get(d.date().isoformat(),0)+1
 week=TODAY-timedelta(days=6)
 return {"name":name,"url":url,
  "articles":[{"t":t,"u":u,"d":d.date().isoformat()} for d,t,u in result[:10]],
  "days":dict(sorted(days.items(),reverse=True)),"total":len(result),
  "today":days.get(TODAY.isoformat(),0),
  "week":sum(v for k,v in days.items() if week.isoformat()<=k<=TODAY.isoformat())}

def runs(repo):
 try:data=json.loads(get(f"https://api.github.com/repos/{repo}/actions/runs?per_page=20","application/vnd.github+json"))
 except Exception as e: print("runs",repo,e);return None
 out=[]
 for x in data.get("workflow_runs",[]):
  t=x.get("updated_at") or x.get("created_at"); start=x.get("run_started_at") or x.get("created_at")
  a,b=dt(t),dt(start)
  out.append({"id":x.get("id"),"number":x.get("run_number"),"s":x.get("conclusion") or x.get("status"),"t":t,"started":start,"created":x.get("created_at"),"d":int((a-b).total_seconds()) if a and b else 0,"e":x.get("event"),"n":x.get("name"),"branch":x.get("head_branch"),"actor":(x.get("actor") or {}).get("login"),"u":x.get("html_url")})
 return out

with open(FILE,encoding="utf-8") as f:data=json.load(f)
old={s.get("name"):s for s in data.get("sites",[])}
for n,u,p in SITES:
 try:
  x=sync_site(n,u,p)
  if x["articles"]: old[n]=x
  print(n,x.get("total"),x.get("today"),x.get("week"))
 except Exception as e: print("site",n,e)
data["sites"]=list(old.values())
by={str(b.get("repo","")).lower():b for b in data.get("bots",[])}
for repo in REPOS:
 r=runs(repo)
 if r is None:continue
 b=by.get(repo.lower())
 if not b:b={"name":repo.split("/",1)[-1],"repo":repo};data.setdefault("bots",[]).append(b);by[repo.lower()]=b
 b["runs"]=r
 if r:
  z=r[0];b.update(status=z["s"],time=z["t"],url=z["u"],last_run_id=z["id"],run_number=z["number"],branch=z["branch"],event=z["e"],actor=z["actor"])
  if z["s"]!="failure":b.pop("failed",None)
data["updated"]=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
data["checked_at"]=data["updated"];data["refresh_interval_seconds"]=300
data["source"]="Live Dashboard Sync · GitHub Actions API + public site sitemaps"
with open(FILE,"w",encoding="utf-8") as f:json.dump(data,f,ensure_ascii=False,indent=2);f.write("\n")
