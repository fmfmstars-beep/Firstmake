import test from 'node:test';
import assert from 'node:assert/strict';
import pages from '../pages/_worker.js';
test('Pages forwards account requests unchanged, including CSRF origin and cookies',async()=>{
 const request=new Request('https://phrase-lane-fmfm-stars.pages.dev/api/login',{method:'POST',headers:{Origin:'https://phrase-lane-fmfm-stars.pages.dev',Cookie:'session=test','Content-Type':'application/json'},body:'{"key":"fixture"}'});
 const result=await pages.fetch(request,{ORIGIN:{async fetch(r){assert.equal(r,request);assert.equal(r.headers.get('Origin'),new URL(r.url).origin);return Response.json({ok:true},{headers:{'Set-Cookie':'session=fixture; Secure; HttpOnly'}});}}});
 assert.equal(result.headers.get('Set-Cookie'),'session=fixture; Secure; HttpOnly');
});
test('public HTML gets canonical URL and verification metadata; account HTML does not',async()=>{
 const env={ORIGIN:{async fetch(){return new Response('<head><link rel="canonical" href="https://phrase-lane.fmfm-stars.workers.dev/blog"></head>',{headers:{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'"}});}}};
 const response=await pages.fetch(new Request('https://phrase-lane-fmfm-stars.pages.dev/blog'),env);const html=await response.text();
 assert.match(html,/https:\/\/phrase-lane-fmfm-stars.pages.dev\/blog/);assert.match(html,/google-adsense-account/);assert.equal(response.headers.get('Content-Security-Policy'),"default-src 'self'");
 assert.doesNotMatch(await (await pages.fetch(new Request('https://phrase-lane-fmfm-stars.pages.dev/account'),env)).text(),/google-adsense-account/);
});
test('ads.txt is publicly readable and HEAD has no body',async()=>{
 const response=await pages.fetch(new Request('https://phrase-lane-fmfm-stars.pages.dev/ads.txt'),{});assert.equal(await response.text(),'google.com, pub-8880235014376283, DIRECT, f08c47fec0942fa0\n');
 assert.equal(await (await pages.fetch(new Request('https://phrase-lane-fmfm-stars.pages.dev/ads.txt',{method:'HEAD'}),{})).text(),'');
});

