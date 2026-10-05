import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const projects = {
  'tidy-csv': { name: 'TidyCSV', project: 'tidy-csv-fmfm-stars' },
  'json-workbench': { name: 'JSONWorkbench', project: 'json-workbench-fmfm-stars' },
  'caption-clean': { name: 'CaptionClean', project: 'caption-clean-fmfm-stars' },
  'image-fit': { name: 'ImageFit Desk', project: 'image-fit-fmfm-stars', blobImages: true },
  'meet-across': { name: 'MeetAcross', project: 'meet-across-fmfm-stars' },
  'pocketmath': { name: 'PocketMath', project: 'pocketmath-fmfm-stars', aliases: { '/about': '/about.html', '/privacy': '/privacy.html' } },
};
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8', '.xml':'application/xml; charset=utf-8' };

export async function build(slug) {
  const config = projects[slug];
  if (!config) throw new Error('Unknown utility project: ' + slug);
  const app = path.join(root, slug);
  const origin = `https://${config.project}.pages.dev`;
  const contents = {};
  async function visit(dir, prefix = '') {
    for (const file of await readdir(dir, { withFileTypes:true })) {
      if (file.isDirectory()) await visit(path.join(dir, file.name), `${prefix}${file.name}/`);
      else contents['/' + prefix + file.name] = await readFile(path.join(dir, file.name), 'utf8');
    }
  }
  await visit(path.join(app, 'public'));
  contents['/ads.txt'] = 'google.com, pub-8880235014376283, DIRECT, f08c47fec0942fa0\n';
  contents['/robots.txt'] = `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
  const pagePaths = Object.keys(contents).filter(p => p.endsWith('.html') && p !== '/404.html').map(p => p === '/index.html' ? '/' : p);
  contents['/sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + pagePaths.map(p => `<url><loc>${origin}${p}</loc></url>`).join('') + '</urlset>\n';
  contents['/404.html'] = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found · ${config.name}</title><link rel="stylesheet" href="/style.css"></head><body><main><h1>Page not found</h1><p>This address does not match a page on ${config.name}.</p><a href="/">Open the tool</a></main></body></html>`;
  for (const [p, html] of Object.entries(contents)) {
    if (!p.endsWith('.html') || p === '/404.html') continue;
    if (!html.includes('ca-pub-8880235014376283')) throw new Error(`Missing ownership metadata: ${p}`);
    for (const ref of html.matchAll(/(?:href|src)=["'](\/[^"']*)["']/g)) {
      const target = ref[1].split(/[?#]/)[0];
      if (target !== '/' && !Object.hasOwn(contents, target)) throw new Error(`${p}: broken link ${target}`);
    }
    if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html)) throw new Error('Inline script: ' + p);
  }
  const assets = Object.fromEntries(Object.entries(contents).map(([p, body]) => [p, {body, type:types[path.extname(p)] || 'application/octet-stream', etag:'"' + createHash('sha256').update(body).digest('hex').slice(0, 24) + '"'}]));
  const imagePolicy = config.blobImages ? "'self' blob:" : "'self'";
  const worker = `const assets = ${JSON.stringify(assets)};\nconst imagePolicy = ${JSON.stringify(imagePolicy)};\nconst aliases = ${JSON.stringify(config.aliases || {})};\n${handle.toString()}\nexport default {fetch:handle};\n`;
  const out = path.join(app, 'dist');
  await mkdir(out, {recursive:true});
  await writeFile(path.join(out, '_worker.js'), worker);
  await writeFile(path.join(app, 'wrangler.jsonc'), JSON.stringify({name:config.project,pages_build_output_dir:'dist',compatibility_date:'2026-10-01'}, null, 2) + '\n');
  console.log(`${config.name}: ${Object.keys(assets).length} routes, ${Buffer.byteLength(worker)} bytes`);
  return { config, assets, worker, out };
}

function handle(request) {
  const headers = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src " + imagePolicy + "; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'",
    'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=(), clipboard-write=(self)',
    'Strict-Transport-Security':'max-age=31536000',
    'Cache-Control':'public, max-age=300',
  };
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405, headers:{...headers, Allow:'GET, HEAD'}});
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); }
  catch { return new Response('Invalid path', {status:400, headers}); }
  if (Object.hasOwn(aliases, pathname)) return new Response(null, {status:308, headers:{...headers, Location:aliases[pathname] + new URL(request.url).search}});
  if (pathname === '/') pathname = '/index.html';
  const found = Object.hasOwn(assets, pathname);
  const asset = assets[found ? pathname : '/404.html'];
  headers['Content-Type'] = asset.type;
  headers.ETag = asset.etag;
  if (found && request.headers.get('If-None-Match') === asset.etag) return new Response(null, {status:304, headers});
  return new Response(request.method === 'HEAD' ? null : asset.body, {status:found ? 200 : 404, headers});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const slug of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(projects)) await build(slug);
}
