'use strict';
const CACHE='lumen-static-__VERSION__',FILES=__FILES__,base=new URL('./',self.location.href);
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
