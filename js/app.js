// BG Automation - App JS
document.addEventListener('DOMContentLoaded', () => {
  const burger = document.getElementById('burger');
  const sidebar = document.getElementById('sidebar');
  if (burger && sidebar) {
    burger.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && !burger.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });

  // Simulate live log updates
  const logsEl = document.getElementById('liveLogs');
  if (logsEl) {
    const samples = [
      { cls: 'ok', src: 'github', text: 'Workflow completed', sub: 'Article automation' },
      { cls: 'info', src: 'yt', text: 'Channel data refreshed', sub: '(6 channels)' },
      { cls: 'tg', src: 'telegram', text: 'New message received', sub: '[SG News18]: Article link' },
      { cls: 'warn', src: 'auto', text: 'Job started', sub: 'BG Tech - Generate Video' },
      { cls: 'ok', src: 'sys', text: 'Health check passed', sub: 'All services OK' },
    ];
    setInterval(() => {
      const s = samples[Math.floor(Math.random() * samples.length)];
      const now = new Date();
      const t = now.toTimeString().slice(0, 8);
      const div = document.createElement('div');
      div.className = 'log-item ' + s.cls;
      div.innerHTML = `<span class="log-time">${t}</span> <span class="log-src ${s.src}">${s.src === 'yt' ? 'YouTube' : s.src === 'auto' ? 'Automation' : s.src.charAt(0).toUpperCase() + s.src.slice(1)}</span> ${s.text}<br><small>${s.sub}</small>`;
      logsEl.insertBefore(div, logsEl.firstChild);
      if (logsEl.children.length > 15) logsEl.removeChild(logsEl.lastChild);
    }, 12000);
  }

  // Quick action buttons feedback
  document.querySelectorAll('.qa-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.disabled = false;
        alert('Action triggered! (Demo mode — connect GitHub Secrets for real runs)');
      }, 1500);
    });
  });
});
