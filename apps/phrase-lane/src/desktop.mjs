// Short-lived, proof-bound desktop sessions. Disabled until explicitly configured.
export class DesktopError extends Error { constructor(status, message) { super(message); this.status = status; } }
const reject = (status, message) => { throw new DesktopError(status, message); };
const now = () => Math.floor(Date.now() / 1000);
const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('');
export const desktopHash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
const valid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const desktopAllowed = (method, path) => ['GET /api/me','GET /api/config','POST /api/translate/text','POST /api/translate/audio','POST /api/desktop/logout'].includes(`${method} ${path}`) || (method === 'GET' && /^\/api\/requests\/[a-zA-Z0-9_-]{1,100}$/.test(path));
function enabled(env) { if (env.DESKTOP_ENABLED !== 'true' || !env.DB) reject(503, 'Desktop connection is not enabled yet. Use the web workspace.'); }
export function desktopNativeRequest(request, env) {
  if (new URL(request.url).origin !== env.SITE_ORIGIN || request.headers.has('Origin') || request.headers.has('Cookie') || request.headers.has('Sec-Fetch-Site')) reject(403, 'Use the native desktop client.');
}
export async function desktopSession(request, env) {
  enabled(env); desktopNativeRequest(request, env);
  const raw = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!raw) reject(401, 'Reconnect your desktop app.');
  if (!desktopAllowed(request.method, new URL(request.url).pathname)) reject(403, 'This action is only available on the website.');
  const hash = await desktopHash(raw);
  const row = await env.DB.prepare('SELECT a.* FROM desktop_sessions d JOIN accounts a ON a.id=d.account_id JOIN sessions s ON s.hash=d.parent_hash AND s.account_id=d.account_id WHERE d.hash=? AND d.expires>? AND s.expires>? AND a.delete_state IS NULL').bind(hash, now(), now()).first();
  if (!row) reject(401, 'Desktop connection has expired. Connect again in your browser.');
  return {account:row,authMethod:'desktop',authenticatedAt:0,verifiedAuthTime:0,csrfToken:null,_sessionHash:hash};
}
export async function desktopRoute(request, env, helpers) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/desktop/')) return null;
  enabled(env);
  if (request.method !== 'POST' || new URL(request.url).search) reject(405, 'Use POST without query parameters.');
  const {body, throttle, getSession, checkCsrf, requireFresh, json} = helpers;
  if (path === '/api/desktop/start') {
    desktopNativeRequest(request, env);
    await throttle(request, env, 'desktop-start', 10, 600);
    const input = await body(request, ['challenge']);
    if (!valid(input.challenge)) reject(400, 'A SHA-256 proof challenge is required.');
    const code = random(), userCode = random().slice(0, 12).toUpperCase(), expires = now()+600;
    await env.DB.prepare('DELETE FROM desktop_pairings WHERE expires<=?').bind(now()).run();
    await env.DB.prepare('DELETE FROM desktop_sessions WHERE expires<=?').bind(now()).run();
    await env.DB.prepare('INSERT INTO desktop_pairings(device_hash,user_code,challenge,expires) VALUES(?,?,?,?)').bind(await desktopHash(code),userCode,input.challenge,expires).run();
    return json({device_code:code,user_code:userCode,verification_uri:env.SITE_ORIGIN+'/desktop-link',expires_in:600,interval:5});
  }
  if (path === '/api/desktop/approve') {
    const session = await getSession(request, env);
    if (!session) reject(401,'Sign in first.');
    await checkCsrf(request,env,session); requireFresh(session);
    if (session.account.delete_state) reject(403,'Account closure is pending.');
    await throttle(request,env,'desktop-approve',10,600);
    const input = await body(request,['user_code','confirmed']);
    if (input.confirmed !== true || typeof input.user_code !== 'string' || !/^[A-F0-9]{12}$/.test(input.user_code)) reject(400,'Enter the 12-character code shown by your own app and confirm.');
    const row = await env.DB.prepare('UPDATE desktop_pairings SET account_id=?,parent_hash=? WHERE user_code=? AND expires>? AND account_id IS NULL AND consumed=0 RETURNING user_code').bind(session.account.id,session._sessionHash,input.user_code,now()).first();
    if (!row) reject(409,'This code is invalid, expired, or already approved.');
    return json({approved:true});
  }
  if (path === '/api/desktop/token') {
    desktopNativeRequest(request,env);
    await throttle(request,env,'desktop-poll',150,600);
    const input = await body(request,['device_code','verifier']);
    if (!valid(input.device_code) || !valid(input.verifier)) reject(400,'Invalid device proof.');
    const hash=await desktopHash(input.device_code), proof=await desktopHash(input.verifier);
    const row=await env.DB.prepare('SELECT * FROM desktop_pairings WHERE device_hash=? AND expires>? AND consumed=0').bind(hash,now()).first();
    if (!row || row.challenge !== proof) reject(401,'The connection code expired or proof did not match.');
    if (!row.account_id) return json({status:'authorization_pending'},202);
    const token=random(), tokenHash=await desktopHash(token), expires=now()+900;
    // Single conditional claim prevents two polls obtaining usable tokens.
    const claim=await env.DB.prepare('UPDATE desktop_pairings SET consumed=1 WHERE device_hash=? AND consumed=0 AND expires>? RETURNING account_id,parent_hash').bind(hash,now()).first();
    if (!claim) reject(409,'Code already used. Start a new connection.');
    // A failed insert leaves a consumed code (fail closed), never two credentials.
    await env.DB.prepare('INSERT INTO desktop_sessions(hash,account_id,parent_hash,expires) SELECT ?,a.id,s.hash,? FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE a.id=? AND s.hash=? AND s.expires>? AND a.delete_state IS NULL').bind(tokenHash,expires,claim.account_id,claim.parent_hash,now()).run();
    if (!await env.DB.prepare('SELECT hash FROM desktop_sessions WHERE hash=?').bind(tokenHash).first()) reject(401,'Browser session ended. Start again.');
    return json({access_token:token,token_type:'Bearer',expires_in:900});
  }
  if (path === '/api/desktop/logout') {
    const session=await desktopSession(request,env);
    await env.DB.prepare('DELETE FROM desktop_sessions WHERE hash=?').bind(session._sessionHash).run();
    return json({signedOut:true});
  }
  reject(404,'Not found.');
}
