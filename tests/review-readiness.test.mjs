import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const origin = 'https://firstmake.fmfm-stars.workers.dev';
async function build(t, document = html) {
  const dir = await mkdtemp(resolve(tmpdir(), 'firstmake-review-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(resolve(dir, 'scripts'));
  await writeFile(resolve(dir, 'index.html'), document);
  await writeFile(resolve(dir, 'hosting-headers.json'), await readFile(resolve(root, 'hosting-headers.json')));
  await writeFile(resolve(dir, 'scripts/build-static.mjs'), await readFile(resolve(root, 'scripts/build-static.mjs')));
  const result = spawnSync(process.execPath, ['scripts/build-static.mjs'], { cwd: dir, encoding: 'utf8' });
  return { dir, result, read: (name) => readFile(resolve(dir, 'dist', name), 'utf8') };
}

test('ownership verification and ads.txt use the observed AdSense publisher', async (t) => {
  const f = await build(t);
  assert.equal(f.result.status, 0, f.result.stderr);
  assert.equal([...html.matchAll(/name="google-adsense-account"/g)].length, 1);
  assert.ok(html.includes('content="ca-pub-8880235014376283"'));
  assert.equal(await f.read('ads.txt'), 'google.com, pub-8880235014376283, DIRECT, f08c47fec0942fa0\n');
  assert.ok(html.includes(`rel="canonical" href="${origin}/"`));
});

test('crawler files list the public page, and failure and health routes remain available', async (t) => {
  const f = await build(t);
  assert.equal(f.result.status, 0);
  assert.equal(await f.read('robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  const sitemap = await f.read('sitemap.xml');
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, 1);
  assert.ok(sitemap.includes(`<loc>${origin}/</loc>`));
  assert.equal(await f.read('healthz'), 'firstmake: ok\n');
  assert.ok((await f.read('404.html')).includes('トップへ戻る'));
});

test('verification adds no executable ad script and preserves enforced CSP', async (t) => {
  const f = await build(t);
  assert.equal(f.result.status, 0);
  const headers = await f.read('_headers');
  const sha = (body) => createHash('sha256').update(body).digest('base64');
  assert.ok(headers.includes(`script-src 'sha256-${sha(html.match(/<script>([\s\S]*?)<\/script>/)[1])}'`));
  assert.ok(headers.includes(`style-src 'sha256-${sha(html.match(/<style>([\s\S]*?)<\/style>/)[1])}'`));
  for (const directive of ['default-src', 'connect-src', 'script-src-attr', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']) {
    assert.ok(headers.includes(`${directive} 'none'`));
  }
  assert.equal(/<script\b[^>]*\bsrc\s*=/i.test(html), false);
  assert.equal(headers.includes("'unsafe-inline'"), false);
  assert.equal(headers.includes("'unsafe-eval'"), false);
  assert.ok(headers.split('\n').every((line) => line.length <= 2000));
  assert.equal(await f.read('index.html'), html);
});

test('internal links, SVG references and disclosure sections have unique targets', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate IDs');
  for (const m of html.matchAll(/\bhref="#([^"]+)"/g)) assert.ok(ids.includes(m[1]), `Missing target ${m[1]}`);
  for (const id of ['implementation', 'project-about', 'privacy']) assert.ok(ids.includes(id));
  assert.ok(html.includes('実店舗の営業・予約は行っていません'));
  assert.ok(html.includes('Google広告を導入する場合'));
});

test('missing or duplicate publisher metadata fails before output generation', async (t) => {
  const missing = await build(t, html.replace(/<meta name="google-adsense-account"[^>]*>/, ''));
  assert.notEqual(missing.result.status, 0);
  const duplicate = await build(t, html.replace('</head>', '<meta name="google-adsense-account" content="ca-pub-8880235014376283"></head>'));
  assert.notEqual(duplicate.result.status, 0);
});

test('Windows line endings produce matching HTML and hashes', async (t) => {
  const f = await build(t, html.replace(/\n/g, '\r\n'));
  assert.equal(f.result.status, 0);
  assert.equal(await f.read('index.html'), html);
  const other = await build(t);
  assert.equal(await f.read('_headers'), await other.read('_headers'));
});
