// Keeps Quiz Film working with no connection once it has been opened: the app's own files are kept on the device.
// With a connection a page is always fetched fresh, so a new build shows up at once; without one, or with one too slow
// to answer in a few seconds, the kept copy is used. Anything that isn't one of the app's own files (speech, photos,
// the rulebook) goes straight to the network.
const CACHE = 'quiz-film-v1';
const SLOW_MS = 3000;   // how long a page or a file waits for the network when a kept copy is there
const scope = new URL(self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// The page lists the files it loaded: keep them, and drop build files it no longer uses.
self.addEventListener('message', event => {
  const keep = event.data && event.data.keep;
  if (!Array.isArray(keep)) return;
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await Promise.all(keep.map(url => cache.match(url).then(hit => hit || cache.add(url)).catch(() => {})));
    const wanted = new Set(keep.map(url => new URL(url, location.href).href));
    for (const request of await cache.keys()) if (request.url.includes('/assets/') && !wanted.has(request.url)) await cache.delete(request);
  }));
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Build files carry their contents in their name, so a kept one is always right.
    if (url.pathname.includes('/assets/')) { const hit = await cache.match(request); if (hit) return hit; }
    const kept = (await cache.match(request, {ignoreSearch: true})) || (request.mode === 'navigate' ? await cache.match(scope) : undefined);
    const net = fetch(request).then(fresh => { if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {}); return fresh; });
    if (!kept) return net;
    // A connection that is there but crawling (a tournament's Wi-Fi) doesn't hold the app up: after a few seconds the
    // kept copy is used, and the fresh one is still kept when it arrives, for next time.
    event.waitUntil(net.catch(() => {}));
    return Promise.race([net.catch(() => kept), new Promise(done => setTimeout(() => done(kept), SLOW_MS))]);
  })());
});
