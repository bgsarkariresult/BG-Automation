(() => {
  'use strict';

  // Keep the notification service worker, but always update it to the current safe version.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js?v=20261009', {scope:'./'}).catch(() => {});
  }

  const RAW = 'https://raw.githubusercontent.com/bgsarkariresult/BG-Automation/main/data/dashboard.json';
  const LIVE = 'https://bg-runf.garhwalbhavesh2002.workers.dev/api/status';
  const TREND_URL = 'https://raw.githubusercontent.com/bgtechlab/Trending-Topic-Finder/main/history.json';

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const ago = (t) => {
    if (!t) return '—';
    const ms = Date.parse(t);
    if (!Number.isFinite(ms)) return '—';
    const m = Math.max(0, (Date.now() - ms) / 60000);
    return m < 1 ? 'अभी' : m < 60 ? Math.floor(m) + ' min ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago';
  };
  const time = (t) => t ? new Date(t).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}) : '--:--';

  const NAV = [
    ['index.html','⌂','Dashboard'], ['youtube.html','▶','YouTube Channels'],
    ['sites.html','🌐','Websites'], ['control.html','⚙','Actions Control'], ['title-updater.html','📝','Title Updater'],
    ['logs.html','📋','Live Logs · Telegram'], ['trending.html','🔥','Trending'],
    ['reports.html','💰','Reports']
  ];

  function shell() {
    document.body.innerHTML =
      '<div class="top">' +
        '<button class="burger" id="menuBtn">☰</button>' +
        '<div class="logo"><div class="logo-bot">🤖</div><div>BG <span>Automation</span><small>AI + Automation | Grow Together</small></div></div>' +
        '<div class="goal-banner">✨ 🚀 <span id="goalLive">Loading…</span> <button class="btn g" id="syncNow" type="button" title="Fresh GitHub Actions sync">↻ Sync</button></div>' +
        '<div class="top-right"><button class="icon-btn" id="notifyBtn" title="Notifications">🔔</button><div class="user-chip"><div class="user-av">B</div> Bhavesh</div></div>' +
      '</div>' +
      '<div class="app"><nav id="sideNav">' +
        NAV.map((n) => '<a class="' + (n[0] === (location.pathname.split('/').pop() || 'index.html') ? 'on' : '') + '" href="/BG-Automation/' + n[0] + '?v=20261008">' + n[1] + ' ' + n[2] + '</a>').join('') +
        '<a href="https://github.com/bgsarkariresult/BG-Automation/settings/secrets/actions" target="_blank" rel="noopener">⚙️ Settings (Secrets)</a>' +
        '<div class="sys"><b>● System Online</b><br><small id="sysS">Loading…</small></div>' +
      '</nav><main id="main"></main></div>';

    $('#menuBtn')?.addEventListener('click', () => $('#sideNav')?.classList.toggle('open'));
    $('#notifyBtn')?.addEventListener('click', enableNotifications);
    $('#syncNow')?.addEventListener('click', async () => {
      const btn = $('#syncNow');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Sync…'; }
      try {
        if ((location.pathname.split('/').pop() || 'index.html') === 'index.html') {
          await refresh(true);
        } else if (typeof window.refreshDashboard === 'function') {
          await window.refreshDashboard(true);
        } else {
          await refresh(true);
        }
      } finally {
        const b = $('#syncNow');
        if (b) { b.disabled = false; b.textContent = '↻ Sync'; }
      }
    });
  }

  async function getJson(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), {
        cache:'no-store', credentials:'omit', signal:controller.signal
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Request timeout');
      throw e;
    } finally { clearTimeout(timer); }
  }

  // एक repo में कई workflow हो सकते हैं, इसलिए पहचान repo + workflow से होती है।
  const botKey = (b) => String((b.repo || '') + '|' + (b.workflow || '')).toLowerCase();
  const DONE = ['success','failure','timed_out','startup_failure'];

  function mergeBot(b, f) {
    const byId = new Map();
    [...(b.runs || []), ...(f.runs || [])].forEach((r) => byId.set(r.id, {...byId.get(r.id), ...r}));
    const runs = [...byId.values()].sort((x,y) => Date.parse(y.created || y.t || 0) - Date.parse(x.created || x.t || 0)).slice(0,100);
    const row = {...b, ...f, name:b.name, runs, live_api_error:null};
    if (runs.length) Object.assign(row, {status:runs[0].s, time:runs[0].t, url:runs[0].u});
    const done = runs.find((r) => DONE.includes(r.s));
    const detail = [f.failed, b.failed].find((x) => x && done && x.run_id === done.id);
    if (done && done.s !== 'success') row.failed = detail || {run_id:done.id, url:done.u, t:done.t};
    else delete row.failed;
    return row;
  }

  // वे automation जिनका सबसे नया पूरा हुआ run fail है
  const failedCount = (bots) => bots.filter((b) => ['failure','timed_out','startup_failure'].includes((b.runs || []).find((r) => DONE.includes(r.s))?.s)).length;

  async function loadData(forceLiveRefresh = false) {
    let d;
    try { d = await getJson('data/dashboard.json'); }
    catch (_) { d = await getJson(RAW); }

    let liveState = 'cached';
    try {
      // Ask the Worker for a fresh check; the timestamp also avoids browser-side caching.
      const live = await getJson(forceLiveRefresh ? LIVE + '?refresh=1' : LIVE, 7000);
      if (live && live.ok && Array.isArray(live.bots) && live.bots.length) {
        const map = new Map(live.bots.map((b) => [botKey(b), b]));
        const good = live.bots.filter((b) => b && b.status !== 'api_error');
        const errors = live.bots.filter((b) => b && b.status === 'api_error');
        d.live_api_errors = errors.length;
        d.live_api_error_message = errors[0]?.api_error || '';
        d.bots = (d.bots || []).map((b) => {
          const f = map.get(botKey(b));
          if (!f) return b;
          if (f.status === 'api_error') return {...b, live_api_error:f.api_error || 'Live API error'};
          // Worker कभी-कभी खाली runs देता है; पुराने cached runs/status न मिटाएँ।
          if (!Array.isArray(f.runs) || !f.runs.length) return b;
          return mergeBot(b, f);
        });
        const have = new Set(d.bots.map(botKey));
        for (const b of live.bots) {
          if (b.status !== 'api_error' && !have.has(botKey(b))) d.bots.push(b);
        }
        d.live_updated = live.updated || live.checked_at || live.timestamp || new Date().toISOString();
        // Never label cached JSON as live when every GitHub Actions request failed.
        liveState = good.length === live.bots.length ? 'live' : good.length ? 'partial' : 'cached';
      }
    } catch (_) {}
    d.live_state = liveState;
    return d;
  }

  // ऊपर की पट्टी और "System Online" — हर page पर
  function paintStatus(d) {
    const bots = Array.isArray(d.bots) ? d.bots : [];
    const running = bots.reduce((n,b) => n + (b.runs || []).filter((r) => r.s === 'in_progress').length, 0);
    const failed = failedCount(bots);
    const isLive = ['live','partial'].includes(d.live_state);
    const stamp = isLive ? (d.live_updated || d.updated) : d.updated;
    const label = d.live_state === 'live' ? '🟢 Live' : d.live_state === 'partial' ? '🟡 Partial data' : '⚠ Cached / API unavailable';
    const pill = $('#goalLive'), sys = $('#sysS');
    if (pill) pill.textContent = label + ' · Last sync: ' + (stamp ? new Date(stamp).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}) : '—') + ' · ' + running + ' running · ' + failed + ' failed';
    if (sys) sys.textContent = (d.live_state === 'live' ? 'Cloudflare Live: ' : d.live_state === 'partial' ? 'Live API partial: ' : 'Dashboard sync: ') + (stamp ? new Date(stamp).toLocaleString('hi-IN') : '—');
  }

  function render(d) {
    const channels = Array.isArray(d.channels) ? d.channels : [];
    const sites = Array.isArray(d.websites) ? d.websites : (Array.isArray(d.sites) ? d.sites : []);
    const bots = Array.isArray(d.bots) ? d.bots : [];
    const msgs = Array.isArray(d.telegram) ? d.telegram : (Array.isArray(d.messages) ? d.messages : []);
    const runs = bots.flatMap((b) => (Array.isArray(b.runs) ? b.runs : []).map((r) => ({b,r}))).sort((a,b) => Date.parse(b.r.t || 0) - Date.parse(a.r.t || 0));
    const counts = {};
    runs.forEach((x) => { const s = String(x.r.s || 'unknown'); counts[s] = (counts[s] || 0) + 1; });
    const success = counts.success || 0, running = counts.in_progress || 0, queued = counts.queued || 0;
    // Failed = वे automation जिनका सबसे नया पूरा हुआ run fail है (पुराने fail नहीं गिने जाते)।
    const failed = failedCount(bots);
    const attention = failed + bots.filter((b) => b.status === 'action_required').length;
    const totalRuns = runs.length;

    const chRows = channels.map((c) =>
      '<div class="list-row">' + (c.icon ? '<img class="list-av sq" src="' + esc(c.icon) + '" alt="">' : '<div class="list-av sq">▶</div>') +
      '<div class="list-info"><b>' + esc(c.name || 'Channel') + '</b><small>' + esc(c.error || c.id || '') + '</small></div><div class="list-meta"><span class="subs">' +
      (c.error ? '—' : fmt(c.subs)) + ' subs</span><span class="badge-s ' + (c.error ? 'paused">ID बाकी' : 'success">Active') + '</span></div></div>'
    ).join('') || '<small class="mu">No channels yet</small>';

    const siteSource = sites.length ? sites : bots.filter((b) => b.site).map((b) => ({name:b.name, url:b.site, repo:b.repo}));
    const siteRows = siteSource.map((s) => {
      const bot = bots.find((b) => String(b.repo || '').toLowerCase() === String(s.repo || '').toLowerCase());
      return '<div class="list-row"><div class="list-av sq">🌐</div><div class="list-info"><b>' + esc(s.name || 'Project') +
        '</b><small>' + esc(s.url || '') + '</small></div>' + chip(bot?.status) + '</div>';
    }).join('') || '<small class="mu">No websites</small>';

    const activity = runs.slice(0,8).map((x) => {
      const s = String(x.r.s || 'unknown');
      const cls = s === 'success' ? 'success' : s === 'failure' ? 'failure' : 'running';
      const icon = s === 'success' ? '✓' : s === 'failure' ? '✕' : '⏳';
      return '<div class="act-row"><div class="act-ico">' + icon + '</div><div class="act-info"><b>' + esc(x.b.name || x.b.repo || 'Automation') +
        '</b><small>' + esc(x.r.n || s) + '</small></div><div class="act-right"><span class="time">' + ago(x.r.t) +
        '</span><span class="badge-s ' + cls + '">' + esc(s) + '</span></div></div>';
    }).join('') || '<small class="mu">No recent activity</small>';

    const logs = runs.slice(0,6).map((x) => {
      const s = String(x.r.s || 'unknown');
      return '<div class="log-line"><span class="log-time">' + time(x.r.t) + '</span><span class="log-tag ' +
        (s === 'success' ? 'success' : s === 'failure' ? 'error' : 'info') + '">[' + esc(s.toUpperCase()) +
        ']</span><span class="log-msg">' + esc(x.b.name || x.b.repo || 'Automation') + '</span></div>';
    }).join('') || '<div class="log-line"><span class="log-msg">Waiting for activity…</span></div>';

    const runningBots = bots.filter((b) => ['in_progress','queued','waiting','pending','requested'].includes(String(b.status || (b.runs || [])[0]?.s || '')));
    const runningRows = runningBots.map((b) => {
      const s = String(b.status || (b.runs || [])[0]?.s || 'in_progress');
      const label = s === 'queued' ? '🟡 Queued' : '🔵 Running';
      return '<div class="tg-row"><div class="tg-av">⚙</div><div class="tg-info"><b>' + esc(b.name || b.repo || 'Automation') +
        '</b><small>' + esc(label) + ' · ' + esc((b.runs || [])[0]?.n || 'Automation task') + '</small></div><span class="tg-time">' + ago((b.runs || [])[0]?.t) + '</span></div>';
    }).join('') || '<small class="mu">अभी कोई automation नहीं चल रहा है।</small>';

    $('#main').innerHTML =
      '<div class="kpi-row">' +
        '<div class="kpi red"><label>🟢 Successful Today</label><div class="num">' + stats(d, TD(), TD()).ok + '</div><div class="sub"><span>Jobs Completed Today</span><span class="up">✓ Success</span></div></div>' +
        '<div class="kpi purple"><label>हाल के Runs</label><div class="num">' + totalRuns + '</div><div class="sub"><span>हर bot के पिछले 100 तक</span><span class="up">✓ ' + success + ' · ✕ ' + (counts.failure || 0) + ' · ⏳ ' + running + '</span></div></div>' +
        '<div class="kpi blue"><label>🔵 Running Now</label><div class="num">' + running + '</div><div class="sub"><span>' + (running ? runs.filter(x => ["in_progress","queued"].includes(String(x.r.s||""))).slice(0,2).map(x => esc(x.b.name || x.b.repo || "Automation")).join(" · ") : "कोई काम अभी नहीं चल रहा") + '</span><span class="up">● Live</span></div></div>' +
      '</div>' +
      '<div class="dash-grid"><div class="col">' +
        '<div class="card"><div class="hd"><h2>▶ YouTube Channels</h2><a href="youtube.html">View All →</a></div>' + chRows + '</div>' +
        '<div class="card"><div class="hd"><h2>🌐 Websites / Projects</h2><a href="sites.html">View All →</a></div>' + siteRows + '</div>' +
      '</div><div class="col">' +
        '<div class="card"><div class="hd"><h2>⚙ Automation Overview</h2><a href="control.html">View Details →</a></div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px"><span class="badge-s running">⏳ ' + running + ' Running</span><span class="badge-s running">… ' + queued + ' Queued</span><span class="badge-s failure">✕ ' + failed + ' Failed</span>' +
          (attention ? '<span class="badge-s paused">⚠ ' + attention + ' Attention</span>' : '<span class="badge-s success">✓ No attention needed</span>') + '</div>' +
          '<div class="auto-grid"><div class="auto-item"><b>▶ YouTube</b><small>' + channels.length + ' Channels</small></div><div class="auto-item"><b>🌐 Websites</b><small>' + siteSource.length + ' Projects</small></div><div class="auto-item"><b>✈ Telegram</b><small>' + msgs.length + ' Messages</small></div><div class="auto-item"><b>🐙 GitHub</b><small>' + bots.length + ' Repos</small></div></div>' +
        '</div>' +
        '<div class="card"><div class="hd"><h2>🕐 Recent Activity</h2><a href="logs.html">View All →</a></div>' + activity + '</div>' +
      '</div><div class="col">' +
        '<div class="card"><div class="hd"><h2>🔥 Trending Topics</h2><a href="trending.html">View All →</a></div><div id="trendBox"><small class="mu">Loading…</small></div></div>' +
        '<div class="card"><div class="hd"><h2>📋 Live Logs</h2><span class="live-dot">Live</span></div>' + logs + '</div>' +
        '<div class="card"><div class="hd"><h2>⚙ Running Automations</h2><span class="live-dot">Live</span></div>' + runningRows + '</div>' +
      '</div></div>' +
      '<div class="footer"><div><b style="color:var(--ac2)">BG</b> Automation · AI + Automation | Grow Together</div><div class="status-ok">' +
      (d.live_state === 'live' ? '● Systems Operational' : '● Dashboard Online') + '</div></div>';

    paintStatus(d);
    loadTrends();
  }

  async function loadTrends() {
    const box = $('#trendBox');
    if (!box) return;
    try {
      let data;
      try { data = await getJson(TREND_URL, 7000); }
      catch (_) { data = await getJson('https://cdn.jsdelivr.net/gh/bgtechlab/Trending-Topic-Finder@main/history.json', 7000); }

      const rows = [];
      Object.keys(data || {}).forEach((k) => {
        const g = data[k] || {};
        (Array.isArray(g.latest) ? g.latest : []).forEach((t) => rows.push(t));
        (Array.isArray(g.suggested) ? g.suggested : []).forEach((t) => rows.push(t));
      });

      const seen = new Set();
      const top = rows.filter((x) => x && (x.title || x.topic || x.name || x.query)).filter((x) => {
        const key = String(x.title || x.topic || x.name || x.query).trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0,5);

      box.innerHTML = top.length ? top.map((t,i) =>
        '<div class="trend-item"><div class="trend-num n' + (i+1) + '">' + (i+1) +
        '</div><div class="trend-info"><b>' + esc(t.title || t.topic || t.name || t.query) +
        '</b><small>' + esc(t.source || 'Trending') + '</small></div><span class="trend-up">↑</span></div>'
      ).join('') : '<small class="mu">No trending data</small>';
    } catch (_) {
      box.innerHTML = '<small class="mu">Trending unavailable · <a href="trending.html" style="color:var(--ac2)">Open →</a></small>';
    }
  }

  async function enableNotifications() {
    if (!('Notification' in window)) return alert('इस browser में notifications उपलब्ध नहीं हैं।');
    if (Notification.permission === 'denied') return alert('Browser settings में notifications Allow करें।');
    const p = await Notification.requestPermission();
    if (p === 'granted') alert('Notifications चालू हो गईं।');
  }

  async function notifyChanges(runs) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
    try {
      const state = JSON.parse(localStorage.getItem('bg_notify_runs') || '{}');
      const next = {};
      const reg = await navigator.serviceWorker.ready;
      for (const x of runs.slice(0,30)) {
        const id = String(x.b.repo || x.b.name) + ':' + String(x.r.id || x.r.number || x.r.t);
        const s = String(x.r.s || 'unknown');
        next[id] = s;
        if (state[id] && state[id] !== s) {
          await reg.showNotification((s === 'success' ? '✅' : s === 'failure' ? '❌' : '🔄') + ' BG Automation', {
            body: (x.b.name || 'Automation') + ' · ' + s,
            tag: 'bg-' + id, renotify: true, data: {url:'logs.html'}
          });
        }
      }
      localStorage.setItem('bg_notify_runs', JSON.stringify(next));
    } catch (_) {}
  }

  let lastSig = '';
  let pageRenderer = null;
  let pageTitle = 'BG Automation';

  async function refresh(forceLiveRefresh = false) {
    try {
      const d = await loadData(forceLiveRefresh);
      const sig = JSON.stringify((d.bots || []).map((b) => ({repo:b.repo,status:b.status,runs:(b.runs || []).slice(0,20).map((r) => [r.id,r.s,r.t])})));
      // Render each successful sync so the visible "Last sync" timestamp stays current.
      lastSig = sig;
      render(d);
      await notifyChanges((d.bots || []).flatMap((b) => (b.runs || []).map((r) => ({b,r}))));
    } catch (e) {
      const main = $('#main');
      if (main) main.innerHTML = '<div class="card"><div class="hd"><h2>⚠️ Dashboard load problem</h2><button class="btn g" id="retryBtn">↻ Retry</button></div><p>Dashboard data load nahi ho pa raha.</p><small>' + esc(e.message || e) + '</small></div>';
      const pill = $('#goalLive'); if (pill) pill.textContent = '⚠ Sync error';
      $('#retryBtn')?.addEventListener('click', refresh);
      console.error('BG Automation:', e);
    }
  }

  // Shared helpers used by every dashboard sub-page.
  const fmt = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return '0';
    return x.toLocaleString('en-IN');
  };
  // तारीख़ हमेशा भारत के समय (IST) से
  const dayOf = (t) => new Date(new Date(t).getTime() + 19800000).toISOString().slice(0,10);
  const TD = () => dayOf(Date.now());
  const at = (t) => t ? new Date(t).toLocaleString('hi-IN') : '—';
  const st = (s) => ({success:'✓',failure:'✕',in_progress:'⏳',queued:'🟡',cancelled:'🚫',timed_out:'⏱️'}[String(s||'')] || '•');
  const chip = (s) => {
    const x=String(s||'unknown');
    const cls=x==='success'?'success':(x==='failure'||x==='timed_out'||x==='action_required')?'failure':(['in_progress','queued','requested'].includes(x)?'running':'paused');
    return '<span class="badge-s '+cls+'">'+esc(x.replace(/_/g,' '))+'</span>';
  };
  const okRun = (r) => String(r?.s||'') === 'success';
  const stats = (d, start, end) => {
    const a=Array.isArray(d?.bots)?d.bots:[];
    const from=start?new Date(start+'T00:00:00+05:30').getTime():-Infinity;
    const to=end?new Date(end+'T23:59:59.999+05:30').getTime():Infinity;
    let ok=0,bad=0,vid=0,min=0,cost=0;
    for(const b of a){
      for(const r of (Array.isArray(b.runs)?b.runs:[])){
        const tm=Date.parse(r.t||r.created||0);
        if(tm<from||tm>to) continue;
        if(okRun(r)){ok++; if(b.kind==='video')vid++; }
        if(['failure','timed_out','action_required','startup_failure'].includes(String(r.s)))bad++;
        if(Number(r.d)>0)min+=Math.ceil(r.d/60);
        cost += okRun(r) ? Number(b.cost||0) : 0;
      }
    }
    return {ok,bad,vid,min,cost};
  };

  // Sub-pages call boot(page, title, renderer). The old dashboard must not
  // render over them; this was the reason every menu item opened Dashboard.
  async function boot(page, title, renderer) {
    pageTitle = title || 'BG Automation';
    document.title = pageTitle;
    pageRenderer = renderer;
    shell();
    const main=$('#main');
    if(main) main.innerHTML='<div class="card"><h2>⏳ '+esc(pageTitle)+'</h2><small>Live data load ho raha hai…</small></div>';
    try {
      const d=await loadData();
      paintStatus(d);
      if(typeof pageRenderer==='function') await pageRenderer(d);
      if(page==='control.html') {
        window.refreshDashboard = async (forceLiveRefresh = false) => {
          const fresh=await loadData(forceLiveRefresh);
          paintStatus(fresh);
          if(typeof pageRenderer==='function') await pageRenderer(fresh);
        };
      } else {
        window.refreshDashboard = async (forceLiveRefresh = false) => {
          const fresh=await loadData(forceLiveRefresh);
          paintStatus(fresh);
          if(typeof pageRenderer==='function') await pageRenderer(fresh);
        };
      }
    } catch(e) {
      if(main) main.innerHTML='<div class="card"><div class="hd"><h2>⚠️ '+esc(pageTitle)+' load problem</h2><button class="btn g" id="pageRetry">↻ Retry</button></div><small>'+esc(e.message||e)+'</small><p><small>Live API fail होने पर cached dashboard data भी दिखाया जा सकता है।</small></p></div>';
      $('#pageRetry')?.addEventListener('click', async () => {
        const btn=$('#pageRetry'); if(btn){btn.disabled=true;btn.textContent='⏳ Loading…';}
        try { const fresh=await loadData(); if(typeof pageRenderer==='function') await pageRenderer(fresh); }
        catch(err){ if(btn){btn.disabled=false;btn.textContent='↻ Retry';} }
      });
    }
    clearInterval(window.__bgPageTimer);
    window.__bgPageTimer=setInterval(()=>{ if(!document.hidden) window.refreshDashboard?.(false); },30000);
  }

  // Expose shared functions for the inline scripts in the sub-pages.
  Object.assign(window,{$,boot,fmt,dayOf,TD,at,st,chip,stats,okRun,esc,ago,time});

  const current = location.pathname.split('/').pop() || 'index.html';
  if (current === 'index.html') {
    shell();
    refresh();
    window.__bgIndexTimer = setInterval(() => { if (!document.hidden) refresh(false); }, 45000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
})();