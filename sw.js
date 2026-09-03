/* Xưởng Nhớ Chữ — service worker
   Quy tắc: mỗi lần sửa code, tăng CACHE_VERSION lên 1 để buộc trình duyệt lấy bản mới. */
const CACHE_VERSION = 'xnc-v7';
const ASSETS = [
  './index.html',
  './app.js?v=6',
  './xinhua.js?v=1',
  './manifest.json?v=1',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e)=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(cache=>cache.addAll(ASSETS)).catch(()=>{}));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_VERSION).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', (e)=>{
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fetchPromise = fetch(e.request).then(networkRes=>{
        if(networkRes && networkRes.status===200){
          const clone = networkRes.clone();
          caches.open(CACHE_VERSION).then(cache=>cache.put(e.request, clone));
        }
        return networkRes;
      }).catch(()=>cached);
      return cached || fetchPromise;
    })
  );
});
