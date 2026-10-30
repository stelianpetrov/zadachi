/* Offline shell: pages and scripts load from the network first and fall back to the last copy when offline.
   Supabase requests (data and login) are never cached here. */
const CACHE = 'zadachi-v1';
const SHELL = ['./', 'index.html', 'bebe.html', 'auth.js', 'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png'];
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all([c.addAll(SHELL), c.add(LIB).catch(() => {})])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const own = url.origin === location.origin, lib = url.hostname === 'cdn.jsdelivr.net' || /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!own && !lib) return;
  if (lib) { // versioned libraries and fonts: cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return res; })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok && !url.search) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
