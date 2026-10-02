import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// index.html remains self-contained; generate only the deployment directory.
const root = fileURLToPath(new URL('../', import.meta.url));
const html = (await readFile(resolve(root, 'index.html'), 'utf8')).replace(/\r\n?/g, '\n');
// Ownership verification uses a meta tag rather than executing advertising JS.
// Extract the publisher from the single verification tag to keep ads.txt in sync.
const publishers = [...html.matchAll(/<meta\s+name="google-adsense-account"\s+content="ca-(pub-\d{16})"\s*\/?\s*>/gi)];
if (publishers.length !== 1) throw new Error('Expected one valid AdSense ownership meta tag.');
const publisherId = publishers[0][1];
const siteOrigin = 'https://firstmake.fmfm-stars.workers.dev';
const headers = JSON.parse(await readFile(resolve(root, 'hosting-headers.json'), 'utf8'));
const hashes = (tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))]
  .map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
const scriptHashes = hashes('script');
const styleHashes = hashes('style');
if (scriptHashes.length !== 1 || styleHashes.length !== 1) throw new Error('Expected one inline script and one inline stylesheet.');
const csp = ["default-src 'none'", `script-src ${scriptHashes.join(' ')}`, "script-src-attr 'none'", `style-src ${styleHashes.join(' ')}`, "img-src 'self' data:", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join('; ');
const out = resolve(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'index.html'), html);
await writeFile(resolve(out, '_headers'), `/*\n  Content-Security-Policy: ${csp}\n  Referrer-Policy: ${headers.referrerPolicy}\n  Permissions-Policy: ${headers.permissionsPolicy}\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n`);
await writeFile(resolve(out, '404.html'), '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ページが見つかりません | KOMOREBI</title><h1>ページが見つかりません</h1><p><a href="/">トップへ戻る</a></p></html>');
await writeFile(resolve(out, 'healthz'), 'firstmake: ok\n');
await writeFile(resolve(out, 'ads.txt'), `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`);
await writeFile(resolve(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`);
await writeFile(resolve(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteOrigin}/</loc></url></urlset>\n`);
console.log('Built Firstmake static assets with hashed CSP.');
