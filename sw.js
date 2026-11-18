'use strict';
const CACHE='lumen-static-4f2470679cfb0a82',FILES=["./app.js", "./assets/LUCIDE-LICENSE.txt", "./assets/PHOTO-CREDIT.txt", "./assets/dark.jpg", "./assets/day.jpg", "./assets/fonts/OFL.txt", "./assets/fonts/manrope.ttf", "./assets/glare.jpg", "./assets/icons.svg", "./assets/lit.jpg", "./assets/tyumen-night.webp", "./assets/uneven.jpg", "./credits.html", "./cv_model.js", "./favicon.svg", "./geo.js", "./icon-192.png", "./icon-512.png", "./index.html", "./manifest.webmanifest", "./model.js", "./operations.js", "./pitch/LUMEN_5_0_Pitch.pdf", "./runtime.js", "./seed.js", "./shift.js", "./studio.css", "./styles.css", "./v2.js", "./v4.css", "./v4.js", "./vendor/leaflet/LICENSE", "./vendor/leaflet/images/layers-2x.png", "./vendor/leaflet/images/layers.png", "./vendor/leaflet/images/marker-icon-2x.png", "./vendor/leaflet/images/marker-icon.png", "./vendor/leaflet/images/marker-shadow.png", "./vendor/leaflet/leaflet.css", "./vendor/leaflet/leaflet.js", "./vision.css", "./vision.js", "./workspace.js"],base=new URL('./',self.location.href);
const paths=new Set(FILES.map(f=>new URL(f,base).pathname));
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES.map(f=>new Request(new URL(f,base),{cache:'reload'})));await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('lumen-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==base.origin)return;
 const home=url.pathname===base.pathname||url.pathname===new URL('index.html',base).pathname;
 if(!home&&!paths.has(url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const key=home?new URL('index.html',base).href:url.origin+url.pathname;return (await cache.match(key))||fetch(req);})());
});
