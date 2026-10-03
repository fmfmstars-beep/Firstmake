import test from 'node:test';
import assert from 'node:assert/strict';
import { build, projects } from '../build.mjs';

for (const slug of Object.keys(projects)) {
  test(`${slug}: published routes, ownership, method and security behavior`, async () => {
    const { worker, assets } = await build(slug);
    const { default:service } = await import('data:text/javascript;base64,' + Buffer.from(worker).toString('base64'));
    const request = (p, init) => service.fetch(new Request('https://example.pages.dev' + p, init));
    const root = await request('/');
    assert.equal(root.status, 200);
    assert.match(await root.text(), /ca-pub-8880235014376283/);
    assert.match(root.headers.get('content-security-policy'), /connect-src 'none'/);
    assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
    const head = await request('/', {method:'HEAD'});
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await request('/__proto__')).status, 404);
    assert.equal((await request('/missing-page')).status, 404);
    assert.equal((await request('/%E0%A4%A')).status, 400);
    assert.equal((await request('/', {method:'POST',body:'private data'})).status, 405);
    assert.equal((await request('/', {headers:{'If-None-Match':root.headers.get('etag')}})).status, 304);
    assert.equal(await (await request('/ads.txt')).text(), 'google.com, pub-8880235014376283, DIRECT, f08c47fec0942fa0\n');
    assert.match(await (await request('/sitemap.xml')).text(), /<loc>https:\/\/.+\.pages\.dev\/guide\.html<\/loc>/);
    for (const p of Object.keys(assets)) assert.equal((await request(p)).status, 200);
    assert.match((await request('/app.js')).headers.get('content-type'), /^text\/javascript/);
    assert.match((await request('/core.mjs')).headers.get('content-type'), /^text\/javascript/);
  });
}
