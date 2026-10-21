// Cache ONLY a generic offline page, never account or translation data.
const CACHE='phraselane-offline-v1';
self.addEventListener('install',event=>event.waitUntil((async()=>{const response=await fetch('/offline',{cache:'reload'});if(response.ok && !response.redirected && response.headers.get('X-PhraseLane-Offline')==='1'){const cache=await caches.open(CACHE);await cache.put('/offline',response);}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('phraselane-offline-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||event.request.method!=='GET'||event.request.mode!=='navigate')return;
 event.respondWith(fetch(event.request).catch(async()=>await caches.match('/offline')||new Response('You are offline. Reconnect to use PhraseLane.',{status:503,headers:{'Content-Type':'text/plain'}})));
});
