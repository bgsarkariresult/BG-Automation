const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>{n=+n||0;return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(Math.round(n))};
const ago=t=>{if(!t)return'—';const m=Math.max(0,(Date.now()-new Date(t))/6e4);return m<1?'abhi':m<60?Math.round(m)+' min pehle':m<1440?Math.round(m/60)+' ghante pehle':Math.round(m/1440)+' din pehle'};
const at=t=>t?new Date(t).toLocaleString('hi-IN',{dateStyle:'short',timeStyle:'short'}):'—';
const liveAgo=t=>{if(!t)return'—';const s=Math.max(0,Math.floor((Date.now()-new Date(t).getTime())/1000));return s<60?s+' sec':Math.floor(s/60)+' min'};
const st=s=>({success:'✔',failure:'✖',cancelled:'✖',in_progress:'⏳',queued:'⏳'}[s]||'•');
const chip=s=>`<span class="chip ${s==='success'?'':(s==='in_progress'||s==='queued')?'w':'e'}">${esc(s)}</span>`;
const dayOf=t=>new Date(t).toLocaleDateString('en-CA');
const TD=()=>dayOf(Date.now());
const okRun=r=>r.s==='success'&&r.d>=60;
function stats(d,from,to){const o={ok:0,bad:0,vid:0,min:0,cost:0};
  d.bots.forEach(b=>b.runs.forEach(r=>{const x=dayOf(r.t);if(x<from||x>(to||'9'))return;
    if(okRun(r)){o.ok++;o.cost+=+b.cost||0;if(b.kind==='video'&&r.d>=120)o.vid++}
    if(r.s==='failure')o.bad++;o.min+=Math.ceil(r.d/60)}));return o}
const NAV=[
  ['index.html','⌂','Dashboard'],
  ['youtube.html','▶','YouTube Channels'],
  ['sites.html','🌐','Websites'],
  ['control.html','⚙','Actions Control'],
  ['logs.html','📋','Live Logs · Telegram'],
  ['trending.html','🔥','Trending'],
  ['reports.html','💰','Reports']
];
const RAW='https://raw.githubusercontent.com/bgsarkariresult/BG-Automation/main/data/dashboard.json';
const LIVE='https://bg-automation-live.garhwalbhavesh2002.workers.dev/api/status';
let bgNotifyLast={};
let lastBootSignature='';
function bootSignature(d){
  return JSON.stringify((d.bots||[]).map(b=>({
    repo:b.repo,name:b.name,status:b.status,workflow:b.workflow,
    runs:(b.runs||[]).slice(0,30).map(r=>({id:r.id||r.number||r.u||r.t,s:r.s,n:r.n,t:r.t,u:r.u,d:r.d}))
  })));
}
function bgNotifyEnable(){
  if(!('Notification' in window)) return alert('इस browser में notifications उपलब्ध नहीं हैं।');
  if(Notification.permission==='denied') return alert('Browser settings में BG-Automation notifications Allow करें।');
  Notification.requestPermission().then(p=>{ if(p==='granted') localStorage.setItem('bg_notify_enabled','1'); });
}
function bgNotifyCheck(d){
  if(!d||!Array.isArray(d.bots)||!('Notification' in window)||Notification.permission!=='granted') return;
  const state=JSON.parse(localStorage.getItem('bg_notify_runs')||'{}');
  const next={};
  d.bots.forEach(b=>(b.runs||[]).slice(0,20).forEach(r=>{
    const id=String(b.repo||b.name)+':'+String(r.id||r.number||r.t||r.u);
    const status=String(r.s||'unknown'); next[id]=status;
    const old=state[id];
    if(old && old!==status){
      const label=status==='success'?'सफल':status==='failure'?'असफल':status==='cancelled'?'रद्द':'स्थिति बदली';
      const icon=status==='success'?'✅':status==='failure'?'❌':status==='cancelled'?'🚫':'🔄';
      const n=new Notification(icon+' BG Automation · '+label,{body:(b.name||b.repo||'Automation')+' — '+(r.n||'Workflow run'),tag:'bg-'+id,renotify:true});
      n.onclick=()=>{window.focus();location.href='logs.html'};
    }
    if(!old && status==='in_progress'){
      new Notification('🔄 BG Automation · काम शुरू',{body:(b.name||b.repo||'Automation')+' — '+(r.n||'Workflow run'),tag:'bg-'+id});
    }
  }));
  localStorage.setItem('bg_notify_runs',JSON.stringify(next));
}
function bgNotifyResetIfNeeded(){
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  if(localStorage.getItem('bg_notify_enabled')==='1') return;
  if(Notification.permission==='granted') localStorage.setItem('bg_notify_enabled','1');
}

function boot(key,title,render){
  document.body.innerHTML=`<div class="top"><button class="burger" onclick="document.querySelector('nav').classList.toggle('open')">☰</button><div class="logo">🚀 BG Automation<br><small>${title}</small></div><div class="pill" id="pill">…</div><button class="icon-btn" title="Notifications" onclick="bgNotifyEnable()">🔔</button></div>
  <div class="app"><nav onclick="this.classList.remove('open')">${NAV.map(n=>`<a class="${n[0]==key?'on':''}" href="${n[0]}">${n[1]} ${n[2]}</a>`).join('')}
  <a href="https://github.com/bgsarkariresult/BG-Automation/settings/secrets/actions" target="_blank" rel="noopener">⚙️ Settings (Secrets)</a>
  <div class="sys"><b>● System Online</b><br><small id="sysS"></small></div></nav><main id="main"></main></div>`;
  async function go(force=false){const btn=document.querySelector('#refreshBtn');try{if(btn){btn.disabled=true;btn.textContent='↻ Loading…'}let r=await fetch(RAW+'?t='+Date.now(),{cache:'no-store'}).catch(()=>null);if(!r||!r.ok)r=await fetch('data/dashboard.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw 0;
    const d=await r.json();
    // Prefer the Cloudflare live Actions API for run status; retain dashboard.json for channels/sites.
    let liveState='fallback';
    try{
      const lr=await fetch(LIVE+'?t='+Date.now(),{cache:'no-store'});
      if(lr.ok){
        const live=await lr.json();
        if(live&&live.ok&&Array.isArray(live.bots)&&live.bots.length){
          const byRepo=new Map(live.bots.map(b=>[String(b.repo||'').toLowerCase(),b]));
          /* Never let a Live API permission/token error erase good cached run data.
             The Worker may return a bot with status=api_error and runs=[] when GitHub
             rejects that repo. Keep dashboard.json for that bot and only merge a
             live bot when it has real run data (or a meaningful non-error status). */
          let liveApiErrors=0;
          d.bots=(d.bots||[]).map(b=>{
            const fresh=byRepo.get(String(b.repo||'').toLowerCase());
            if(!fresh) return b;
            if(fresh.status==='api_error' || (Array.isArray(fresh.runs)&&fresh.runs.length===0 && !['in_progress','queued','unknown'].includes(fresh.status))){
              liveApiErrors++;
              return {...b, live_api_error:fresh.api_error||'Live API could not read this repository'};
            }
            return {...b,...fresh,runs:Array.isArray(fresh.runs)?fresh.runs:b.runs};
          });
          /* Add genuinely new live projects, but never add api_error-only placeholders. */
          for(const b of live.bots){
            const exists=(d.bots||[]).some(x=>String(x.repo||'').toLowerCase()===String(b.repo||'').toLowerCase());
            if(!exists && b.status!=='api_error') d.bots.push(b);
          }
          d.live_api_errors=liveApiErrors;
          d.live_updated=live.updated||live.checked_at||live.timestamp||new Date().toISOString();
          liveState=liveApiErrors ? 'partial' : 'live';
        }
      }
    }catch(_){}
    d.live_state=liveState;window.LU=d.updated;window.D=d;bgNotifyResetIfNeeded();
    const sig=bootSignature(d);
    const shouldRender=sig!==lastBootSignature;
    if(shouldRender){lastBootSignature=sig;bgNotifyCheck(d);render(d);}
    else{bgNotifyCheck(d);}
    const stamp=d.live_state==='live'?(d.live_updated||d.updated):d.updated;const age=stamp?Math.max(0,Math.floor((Date.now()-new Date(stamp).getTime())/60000)):Infinity;const liveAge=stamp?liveAgo(stamp):'—';
    const channelOk=(d.channels||[]).every(c=>!c.error||/YAHAN/.test(c.id));
    const fresh=age<=7;
    const pill=$('#pill');
    if(pill){
      pill.textContent=d.live_state==='live'?'● LIVE · '+liveAge+' ago':d.live_state==='partial'?'● LIVE + cached · '+liveAge+' ago':!channelOk?'⚠ Channel ID/API check':fresh?'● Cached data · '+age+' min':'⚠ Data delayed · '+(Number.isFinite(age)?age+' min':'unknown');
      pill.classList.toggle('bad',!fresh||!channelOk);
    }
    const sys=$('#sysS');if(sys)sys.textContent=(d.live_state==='live'?'Cloudflare Live: ':'Dashboard sync: ')+at(stamp);
    }catch(e){$('#pill').textContent='⚠ Sync Dashboard chalao';$('#pill').classList.add('bad')}finally{if(btn){btn.disabled=false;btn.textContent='↻ Refresh'}}}
  window.refreshDashboard=()=>go(true);go();setInterval(()=>{if(!document.hidden)go(false)},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)go(true)})}
