const PUBLISHER = 'ca-pub-8880235014376283';
const WORKER_ORIGIN = 'https://phrase-lane.fmfm-stars.workers.dev';

// The same application handles API requests and owns its D1 and secret bindings.
// Forward the original URL, Origin and cookies so its CSRF and account checks hold.
export default {
 async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/ads.txt' && ['GET','HEAD'].includes(request.method)) {
   return new Response(request.method === 'HEAD' ? null : 'google.com, pub-8880235014376283, DIRECT, f08c47fec0942fa0\n', {
    headers: {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}
   });
  }
  const response = await env.ORIGIN.fetch(request);
  if (request.method !== 'GET' || !response.headers.get('Content-Type')?.startsWith('text/html')) return response;
  let html = await response.text();
  html = html.replaceAll(WORKER_ORIGIN, url.origin);
  if (response.ok && !['/account','/404'].includes(url.pathname.replace(/\/$/,''))) {
   html = html.replace('</head>', `<meta name="google-adsense-account" content="${PUBLISHER}"></head>`);
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(html, {status:response.status, statusText:response.statusText, headers});
 }
};

