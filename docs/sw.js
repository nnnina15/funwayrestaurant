// 風味記帳｜離線快取
// 有網路：一律先拿最新版（最多等 4 秒），所以改版後打開就是新的
// 沒網路：用這台裝置存的版本，照樣能開
const VERSION = '2.4.0';
const CACHE = 'fengwei-v' + VERSION;
const ASSETS = ['./', './index.html', './app.js', './compute.js', './manifest.json',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data === 'version' && e.source) e.source.postMessage({ version: VERSION });
});

// 只處理 App 自己的檔案；同步請求（Google）一律直接走網路
self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});

function networkFirst(req) {
  return new Promise(function (resolve) {
    let done = false;
    const fromCache = function () {
      return caches.match(req, { ignoreSearch: true }).then(function (c) {
        return c || (req.mode === 'navigate' ? caches.match('./index.html') : null);
      });
    };
    const timer = setTimeout(function () {          // 網路太慢：先用本機版本
      fromCache().then(function (c) { if (c && !done) { done = true; resolve(c); } });
    }, 4000);
    fetch(req, { cache: 'no-store' }).then(function (res) {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(function () {
      fromCache().then(function (c) {
        if (!done) { done = true; clearTimeout(timer); resolve(c || new Response('離線中，且這台裝置還沒存過 App', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })); }
      });
    });
  });
}
