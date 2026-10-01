const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>{n=+n||0;return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(Math.round(n))};
const ago=t=>{if(!t)return'—';const m=Math.max(0,(Date.now()-new Date(t))/6e4);return m<1?'abhi':m<60?Math.round(m)+' min pehle':m<1440?Math.round(m/60)+' ghante pehle':Math.round(m/1440)+' din pehle'};
const at=t=>t?new Date(t).toLocaleString('hi-IN',{dateStyle:'short',timeStyle:'short'}):'—';
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
  ['index.html','🏠','Dashboard'],
  ['control.html','⚡','Actions Control'],
  ['youtube.html','▶️','YouTube Studio'],
  ['sites.html','📰','Website & Articles'],
  ['trending.html','🔥','Trending Topics'],
  ['reports.html','💰','Kharcha & Report'],
  ['logs.html','💻','Logs & Telegram']
];
const RAW='https://raw.githubusercontent.com/bgsarkariresult/BG-Automation/main/data/dashboard.json';
function boot(key,title,render){
  document.body.innerHTML=`<div class="top"><button class="burger" onclick="document.querySelector('nav').classList.toggle('open')">☰</button><div class="logo">🚀 BG Automation<br><small>${title}</small></div><div class="pill" id="pill">…</div></div>
  <div class="app"><nav onclick="this.classList.remove('open')">${NAV.map(n=>`<a class="${n[0]==key?'on':''}" href="${n[0]}">${n[1]} ${n[2]}</a>`).join('')}
  <a href="https://github.com/bgsarkariresult/BG-Automation/settings/secrets/actions" target="_blank" rel="noopener">⚙️ Settings (Secrets)</a>
  <div class="sys"><b>● System Online</b><br><small id="sysS"></small></div></nav><main id="main"></main></div>`;
  async function go(force=false){const btn=document.querySelector('#refreshBtn');try{if(btn){btn.disabled=true;btn.textContent='↻ Loading…'}let r=await fetch(RAW+'?t='+Date.now(),{cache:'no-store'}).catch(()=>null);if(!r||!r.ok)r=await fetch('data/dashboard.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw 0;
    const d=await r.json();if(d.updated===window.LU&&!force)return;window.LU=d.updated;window.D=d;
    const good=d.channels.every(c=>!c.error||/YAHAN/.test(c.id));$('#pill').textContent=good?'✔ GitHub Secrets Connected':'⚠ Channel ID check karo';$('#pill').classList.toggle('bad',!good);
    $('#sysS').textContent='Sync: '+at(d.updated);render(d)}catch(e){$('#pill').textContent='⚠ Sync Dashboard chalao';$('#pill').classList.add('bad')}finally{if(btn){btn.disabled=false;btn.textContent='↻ Refresh'}}}
  window.refreshDashboard=()=>go(true);go();setInterval(()=>go(false),60000)}
