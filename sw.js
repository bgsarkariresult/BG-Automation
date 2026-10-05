// BG-Automation service worker: offline cache + background Web Push notifications
const CACHE = 'bg-automation-v2';
const ASSETS = [
  '/BG-Automation/control.html',
  '/BG-Automation/manifest.json',
  '/BG-Automation/icons/icon-192.png',
  '/BG-Automation/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('/BG-Automation/control.html'))));
});

self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch (_) { data = { title: 'BG Automation', body: event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'BG Automation', {
    body: data.body || '',
    icon: '/BG-Automation/icons/icon-192.png',
    badge: '/BG-Automation/icons/icon-192.png',
    tag: data.tag || 'bg-automation',
    data: { url: data.url || '/BG-Automation/logs.html' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/BG-Automation/logs.html';
  event.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(clients => {
    for (const client of clients) {
      if ('focus' in client) { client.navigate(target); return client.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
