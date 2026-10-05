import {ASSETS} from './assets.mjs';
const encoder = new TextEncoder();
export const LANGUAGES = {en:'English',es:'Spanish',fr:'French',de:'German',it:'Italian',pt:'Portuguese',ja:'Japanese',ko:'Korean',zh:'Chinese',ar:'Arabic',hi:'Hindi',nl:'Dutch'};
const now = () => Math.floor(Date.now()/1000);
const hex = b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export const digest = async s => hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail = (s,m) => {throw new HttpError(s,m);};
export function secureHeaders(contentType='application/json; charset=utf-8') {return {'Content-Type':contentType,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'Strict-Transport-Security':'max-age=31536000','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'microphone=(self), camera=(), geolocation=(), payment=()'};}
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{...secureHeaders(),...extra}});
const cookie = (t,age=2592000) => `__Host-phrase_session=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export function sameOrigin(r) {if(r.headers.get('Origin')!==new URL(r.url).origin)fail(403,'Please use this website to make this request.');}
export async function readLimited(r,max=10000){if(Number(r.headers.get('Content-Length')||0)>max)fail(413,'Request is too large.');if(!r.body)return '';const reader=r.body.getReader();let n=0,parts=[];try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>max){await reader.cancel();fail(413,'Request is too large.');}parts.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(n);let p=0;for(const a of parts){bytes.set(a,p);p+=a.length;}return new TextDecoder().decode(bytes);}
async function body(r){if(!(r.headers.get('Content-Type')||'').startsWith('application/json'))fail(415,'Send JSON.');try{const value=JSON.parse(await readLimited(r));if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Send a JSON object.');return value;}catch(e){if(e instanceof HttpError)throw e;fail(400,'Invalid JSON.');}}
export function validateTranslation(b,max=500){if(!b||typeof b.text!=='string'||!b.text.trim())fail(400,'Enter text to translate.');const text=b.text.trim();if([...text].length>max)fail(400,`Use ${max} characters or fewer.`);if(typeof b.source!=='string'||typeof b.target!=='string'||!Object.hasOwn(LANGUAGES,b.source)||!Object.hasOwn(LANGUAGES,b.target))fail(400,'Choose a supported language.');return {text,source_lang:b.source,target_lang:b.target};}
async function consume(env,key,amount,limit,expires){if(!Number.isFinite(limit)||limit<amount||amount<1)fail(429,'Usage limit reached.');const row=await env.DB.prepare('INSERT INTO usage(key,amount,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET amount=usage.amount+excluded.amount WHERE usage.amount+excluded.amount<=? RETURNING amount').bind(key,amount,expires,limit).first();if(!row)fail(429,'Usage limit reached. Please try again after the allowance resets.');return row.amount;}
async function network(r,env){if(!env.QUOTA_SALT||!env.DB)fail(503,'The service is being configured. Please try later.');return digest(`${env.QUOTA_SALT}:${r.headers.get('CF-Connecting-IP')||'unknown'}`);}
async function throttle(r,env,kind,limit=20,period=60){const key=await network(r,env);const bucket=Math.floor(now()/period);await consume(env,`rate:${kind}:${key}:${bucket}`,1,limit,(bucket+2)*period);return key;}
async function current(r,env){const c=r.headers.get('Cookie')||'';const raw=c.match(/(?:^|;\s*)__Host-phrase_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!raw||!env.DB)return null;return env.DB.prepare('SELECT a.* FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.hash=? AND s.expires>?').bind(await digest(raw),now()).first();}
async function required(r,env){const a=await current(r,env);if(!a)fail(401,'Create or restore your account first.');return a;}
async function session(env,id){const t=token();await env.DB.prepare('INSERT INTO sessions(hash,account_id,expires) VALUES(?,?,?)').bind(await digest(t),id,now()+2592000).run();return t;}
const isPro=a=>!!a&&a.status==='active'&&Number.isSafeInteger(a.valid_until)&&a.valid_until>now();
const terminalSubscription=s=>['canceled','incomplete_expired'].includes(s);
const stripeId=v=>typeof v==='string'?v:v?.id;
const matchingItems=(s,env)=>s.items?.data?.filter(i=>i.price?.id===env.STRIPE_PRICE_ID)||[];
const billingEnvironment=e=>['live','test'].includes(e.BILLING_MODE)&&new RegExp('^(?:sk|rk)_'+e.BILLING_MODE+'_').test(e.STRIPE_SECRET_KEY||'');
export function billingReady(e){return e.BILLING_ENABLED==='true'&&e.LEGAL_READY==='true'&&e.BILLING_TESTED==='true'&&billingEnvironment(e)&&!!e.STRIPE_SECRET_KEY&&!!e.STRIPE_WEBHOOK_SECRET&&!!e.STRIPE_PRICE_ID&&!!e.SELLER_NAME&&!!e.SELLER_ADDRESS&&!!e.SELLER_PHONE&&!!e.CONTACT_EMAIL;}
async function stripe(env,path,data=null,idempotency=null){if(!billingEnvironment(env))fail(503,'Subscriptions are not open yet.');const headers={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Stripe-Version':'2026-08-26.dahlia'};if(data)headers['Content-Type']='application/x-www-form-urlencoded';if(idempotency)headers['Idempotency-Key']=idempotency;const res=await fetch(`https://api.stripe.com/v1/${path}`,{method:data?'POST':'GET',headers,body:data?new URLSearchParams(data):undefined,signal:AbortSignal.timeout(15000)});let out;try{out=await res.json();}catch{fail(502,'Billing service is temporarily unavailable.');}if(!res.ok)fail(502,'Billing service is temporarily unavailable.');return out;}
export async function verifyStripe(raw,header,secret,time=now()){if(!secret||!header)return false;const values=header.split(',').map(x=>x.split('='));const t=values.find(x=>x[0]==='t')?.[1];if(!/^\d+$/.test(t||'')||Math.abs(time-Number(t))>300)return false;const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);for(const [k,v] of values){if(k!=='v1'||!/^([a-f0-9]{2}){32}$/.test(v))continue;const sig=Uint8Array.from(v.match(/../g),x=>parseInt(x,16));if(await crypto.subtle.verify('HMAC',key,sig,encoder.encode(`${t}.${raw}`)))return true;}return false;}
async function paidSubscriptionUntil(env,s,customer,items){
 // An active subscription can still have an unpaid or failed delayed payment.
 // Grant only a settled invoice line for this customer's configured Price and
 // current subscription item; subscription period dates alone are not payment.
 const currentItems=items.filter(i=>typeof i.id==='string'&&Number.isSafeInteger(i.current_period_end)&&i.current_period_end>now());
 if(s.status!=='active'||!currentItems.length)return 0;
 const invoices=await stripe(env,`invoices?subscription=${encodeURIComponent(s.id)}&status=paid&limit=100`);
 if(!Array.isArray(invoices.data))fail(503,'Paid invoice details are unavailable. Please try later.');
 let end=0;
 for(const invoice of invoices.data){
  if(typeof invoice.id!=='string'||!/^in_[a-zA-Z0-9_]+$/.test(invoice.id)||invoice.status!=='paid'||invoice.livemode!==(env.BILLING_MODE==='live')||stripeId(invoice.customer)!==customer||stripeId(invoice.parent?.subscription_details?.subscription||invoice.subscription)!==s.id)fail(403,'Paid invoice does not match this subscription.');
  let lines=invoice.lines;
  if(lines?.has_more)lines=await stripe(env,`invoices/${encodeURIComponent(invoice.id)}/lines?limit=100`);
  if(!Array.isArray(lines?.data)||lines.has_more)fail(503,'Paid invoice lines need review before access can be confirmed.');
  for(const line of lines.data){
   const parent=line.parent?.subscription_item_details;
   const item=currentItems.find(i=>i.id===stripeId(parent?.subscription_item||line.subscription_item));
   const price=stripeId(line.pricing?.price_details?.price||line.price);
   const start=line.period?.start,finish=line.period?.end;
   if(!item||price!==env.STRIPE_PRICE_ID||stripeId(parent?.subscription||line.subscription)!==s.id||line.invoice!==invoice.id||line.livemode!==(env.BILLING_MODE==='live')||!Number.isSafeInteger(line.amount)||line.amount<0||!Number.isSafeInteger(start)||!Number.isSafeInteger(finish)||start<0||finish<=start||start>now())continue;
   end=Math.max(end,Math.min(finish,item.current_period_end));
  }
 }
 if(invoices.has_more&&end<=now())fail(503,'Paid invoice history needs review before access can be confirmed.');
 return end;
}
async function syncSub(env,id,accountId,eventId=null,expectedCustomer=null){
 const s=await stripe(env,`subscriptions/${encodeURIComponent(id)}`);
 if(s.id!==id||s.livemode!==(env.BILLING_MODE==='live'))fail(403,'Subscription environment does not match.');
 const items=matchingItems(s,env);
 if(!items.length)fail(403,'Subscription price does not match.');
 const mapped=await env.DB.prepare('SELECT * FROM accounts WHERE subscription=?').bind(id).first();
 accountId=accountId||mapped?.id||s.metadata?.account_id;
 if(mapped&&mapped.id!==accountId)fail(403,'Subscription does not match this account.');
 const a=accountId&&await env.DB.prepare('SELECT * FROM accounts WHERE id=?').bind(accountId).first();
 if(!a)fail(503,'Subscription account is not available yet.');
 // An established database mapping is authoritative. Metadata bootstraps only
 // the first subscription and must never redirect another customer's billing.
 if(s.metadata?.account_id&&s.metadata.account_id!==accountId)fail(403,'Subscription does not match this account.');
 if(!mapped&&s.metadata?.account_id!==accountId)fail(403,'Subscription does not match this account.');
 const customer=stripeId(s.customer);
 if(typeof customer!=='string'||!/^cus_[a-zA-Z0-9_]+$/.test(customer)||(a.customer&&a.customer!==customer)||(expectedCustomer&&expectedCustomer!==customer))fail(403,'Billing customer does not match this account.');
 if(a.subscription&&a.subscription!==id){
  // Delayed notifications from an older subscription must not overwrite the
  // account's replacement subscription. New checkout is allowed only after
  // the preceding subscription is terminal.
  if(eventId&&s.status!=='active')return null;
  if(!terminalSubscription(a.status)||s.status!=='active')fail(409,'Manage your existing subscription before starting another.');
 }
 const end=await paidSubscriptionUntil(env,s,customer,items);
 const update=env.DB.prepare('UPDATE accounts SET customer=?,subscription=?,status=?,valid_until=? WHERE id=? AND subscription IS ? AND customer IS ? AND status=? AND valid_until=?').bind(customer,s.id,s.status,end,accountId,a.subscription,a.customer,a.status,a.valid_until);
 let result;
 if(eventId){const results=await env.DB.batch([update,env.DB.prepare('INSERT OR IGNORE INTO stripe_events(id,processed) SELECT ?,? WHERE EXISTS (SELECT 1 FROM accounts WHERE id=? AND subscription=? AND customer=? AND status=? AND valid_until=?)').bind(eventId,now(),accountId,s.id,customer,s.status,end)]);result=results[0];}else result=await update.run();
 if((result?.meta?.changes??result?.changes)===0)fail(409,'Billing state changed. Please try again.');
 return s;
}
async function checkoutCustomer(env,a){
 if(a.customer)return a.customer;
 const c=await stripe(env,'customers',{'metadata[account_id]':a.id},`phrase-customer-${a.id}`);
 if(typeof c.id!=='string'||!/^cus_[a-zA-Z0-9_]+$/.test(c.id)||c.livemode!==(env.BILLING_MODE==='live'))fail(502,'Billing customer could not be created.');
 await env.DB.prepare('UPDATE accounts SET customer=? WHERE id=? AND customer IS NULL').bind(c.id,a.id).run();
 const saved=await env.DB.prepare('SELECT customer FROM accounts WHERE id=?').bind(a.id).first();
 if(!saved?.customer)fail(503,'Billing account could not be saved. Please try again.');
 return saved.customer;
}
async function preventDuplicateSubscription(env,a,customer){
 if(a.subscription){const existing=await syncSub(env,a.subscription,a.id);if(!terminalSubscription(existing.status))fail(409,'You already have a subscription. Use Manage billing.');}
 // Stripe is the source of truth even when Checkout has completed before its
 // webhook arrives, or the local entitlement has expired after a failed renewal.
 const list=await stripe(env,`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`);
 if(!Array.isArray(list.data)||list.has_more)fail(503,'Billing history needs review before another subscription can start.');
 for(const s of list.data){
  if(s.livemode!==(env.BILLING_MODE==='live')||stripeId(s.customer)!==customer)fail(403,'Subscription environment does not match.');
  if(matchingItems(s,env).length&&!terminalSubscription(s.status))fail(409,'You already have a subscription. Use Manage billing.');
 }
}
async function pendingCheckout(env,a,customer){
 const list=await stripe(env,`checkout/sessions?customer=${encodeURIComponent(customer)}&limit=100&expand%5B%5D=data.line_items`);
 if(!Array.isArray(list.data)||list.has_more)fail(503,'Pending billing sessions need review. Please try later.');
 let expired=null;
 for(const s of list.data){
  if(s.livemode!==(env.BILLING_MODE==='live')||stripeId(s.customer)!==customer)fail(403,'Checkout environment does not match.');
  if(s.mode!=='subscription'||s.client_reference_id!==a.id||!['open','expired'].includes(s.status))continue;
  if(!Array.isArray(s.line_items?.data)||s.line_items.has_more)fail(503,'Pending checkout details are unavailable. Please try later.');
  if(s.line_items.data.length!==1||s.line_items.data[0].price?.id!==env.STRIPE_PRICE_ID||s.line_items.data[0].quantity!==1)continue;
  if(s.status==='open'&&s.expires_at>now())return {url:checkoutUrl(s),attempt:null};
  if(!/^cs_[a-zA-Z0-9_]+$/.test(s.id||'')||!Number.isSafeInteger(s.created))fail(503,'Expired checkout details are unavailable. Please try later.');
  if(!expired||s.created>expired.created)expired=s;
 }
 // Rotate only after a confirmed expired attempt. Concurrent retries still
 // share the same key, but cannot receive an old Stripe-idempotency response.
 return {url:null,attempt:expired?.id||'initial'};
}
function checkoutUrl(s){
 let url;try{url=new URL(s.url);}catch{fail(502,'Checkout is not available. Please try again.');}
 if(s.status!=='open'||!Number.isSafeInteger(s.expires_at)||s.expires_at<=now()||url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')fail(502,'Checkout is not available. Please try again.');
 return url.href;
}
async function webhook(r,env){
 const raw=await readLimited(r,262144);
 if(!await verifyStripe(raw,r.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET))fail(400,'Invalid webhook signature.');
 let e;try{e=JSON.parse(raw);}catch{fail(400,'Invalid event.');}
 if(!e||typeof e.id!=='string'||!/^evt_[a-zA-Z0-9_]+$/.test(e.id)||typeof e.type!=='string')fail(400,'Invalid event.');
 const expectedLive=env.BILLING_MODE==='live';
 if(!['live','test'].includes(env.BILLING_MODE)||e.livemode!==expectedLive)fail(400,'Incorrect billing environment.');
 const checkoutEvents=['checkout.session.completed','checkout.session.async_payment_succeeded'];
 const subscriptionEvents=['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed'];
 const invoiceEvents=['invoice.paid','invoice.payment_failed','invoice.payment_action_required','invoice.finalization_failed'];
 if(![...checkoutEvents,...subscriptionEvents,...invoiceEvents].includes(e.type))return json({received:true});
 if(await env.DB.prepare('SELECT id FROM stripe_events WHERE id=?').bind(e.id).first())return json({received:true});
 const obj=e.data?.object;if(!obj||typeof obj!=='object')fail(400,'Invalid event.');
 let subscription=null,accountId=null,expectedCustomer=null;
 const stringId=v=>typeof v==='string'?v:v?.id;
 if(checkoutEvents.includes(e.type)){
  if(obj.mode!=='subscription'||obj.payment_status!=='paid')return json({received:true});
  if(obj.livemode!==expectedLive||obj.status!=='complete'||typeof obj.client_reference_id!=='string')fail(400,'Invalid checkout notification.');
  subscription=stringId(obj.subscription);accountId=obj.client_reference_id;expectedCustomer=stringId(obj.customer);
  if(typeof expectedCustomer!=='string'||!/^cus_[a-zA-Z0-9_]+$/.test(expectedCustomer))fail(400,'Missing billing customer.');
 }else if(subscriptionEvents.includes(e.type)){
  subscription=obj.id;accountId=obj.metadata?.account_id;
 }else{
  subscription=stringId(obj.parent?.subscription_details?.subscription||obj.subscription);
 }
 if(subscription){
  if(typeof subscription!=='string'||!/^sub_[a-zA-Z0-9_]+$/.test(subscription))fail(400,'Invalid subscription.');
  if(!accountId)accountId=(await env.DB.prepare('SELECT id FROM accounts WHERE subscription=?').bind(subscription).first())?.id;
  await syncSub(env,subscription,accountId,e.id,expectedCustomer);
  return json({received:true});
 }
 // Non-subscription invoices belong to other products. Never mark an
 // unresolved paid checkout or subscription notification as completed.
 if(!invoiceEvents.includes(e.type))fail(400,'Missing subscription reference.');
 return json({received:true});
}
export async function api(r,env,ctx){const u=new URL(r.url);const path=u.pathname;if(path==='/api/config'&&r.method==='GET')return json({billing:billingReady(env),languages:LANGUAGES,maxChars:500,freeRequests:10,proPrice:9});if(path==='/api/webhook'&&r.method==='POST')return webhook(r,env);if(path==='/api/account'&&r.method==='GET'){const a=await current(r,env);const month=new Date().toISOString().slice(0,7);let used=0;if(a)used=(await env.DB.prepare('SELECT amount FROM usage WHERE key=?').bind(`pro:${a.id}:${month}`).first())?.amount||0;const date=new Date(),quotaStart=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1)/1000,quotaReset=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)/1000;return json({signedIn:!!a,plan:isPro(a)?'pro':'free',status:a?.status||'free',used,limit:50000,billing:billingReady(env),billingPortalAvailable:!!a?.customer,validUntil:a?.valid_until||0,quotaPeriod:{type:'calendar_month',timezone:'UTC',start:quotaStart,resetsAt:quotaReset},proDailyRequestLimit:100,proMaxChars:1000});}
if(r.method!=='POST')fail(405,'Method not allowed.');sameOrigin(r);
if(path==='/api/accounts'){await throttle(r,env,'signup',3,86400);await consume(env,`signup-global:${Math.floor(now()/86400)}`,1,100,now()+172800);const key=token(),id=crypto.randomUUID();await env.DB.prepare('INSERT INTO accounts(id,recovery_hash,created) VALUES(?,?,?)').bind(id,await digest(key),now()).run();return json({recoveryKey:`PL-${key}`},201,{'Set-Cookie':cookie(await session(env,id))});}
if(path==='/api/login'){await throttle(r,env,'login',10,3600);const b=await body(r);if(typeof b.key!=='string'||!/^PL-[a-f0-9]{64}$/.test(b.key))fail(401,'Account key not recognised.');const a=await env.DB.prepare('SELECT id FROM accounts WHERE recovery_hash=?').bind(await digest(b.key.slice(3))).first();if(!a)fail(401,'Account key not recognised.');return json({ok:true},200,{'Set-Cookie':cookie(await session(env,a.id))});}
if(path==='/api/logout'){const raw=(r.headers.get('Cookie')||'').match(/__Host-phrase_session=([a-f0-9]{64})/)?.[1];if(raw)await env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await digest(raw)).run();return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
if(path==='/api/translate'){if(env.AI_ENABLED==='false')fail(503,'AI translation is temporarily unavailable. The local tools are still available.');const ip=await throttle(r,env,'translate',6,60);const a=await current(r,env),pro=isPro(a);const input=validateTranslation(await body(r),pro?1000:500);if(input.source_lang===input.target_lang)return json({text:input.text,elapsedMs:0,engine:'Same language'});const day=Math.floor(now()/86400);if(pro){await consume(env,`pro-day:${a.id}:${day}`,1,100,(day+2)*86400);await consume(env,`pro:${a.id}:${new Date().toISOString().slice(0,7)}`,[...input.text].length,50000,now()+5356800);}else await consume(env,`free:${ip}:${day}`,1,10,(day+2)*86400);
// Global cost fuse is independent of visitor identity; exceeding it fails closed.
await consume(env,`global:${day}`,1,Number(env.DAILY_TRANSLATION_CAP||200),(day+2)*86400);const start=Date.now();let output;try{output=await env.AI.run('@cf/meta/m2m100-1.2b',input);}catch{fail(503,'Translation is temporarily busy. Your draft is still here; try later.');}if(typeof output?.translated_text!=='string'||!output.translated_text.trim())fail(502,'No translation returned. Please try a shorter sentence.');return json({text:output.translated_text,elapsedMs:Date.now()-start,engine:'Cloudflare AI'});}
if(path==='/api/checkout'){await throttle(r,env,'checkout',5,3600);if(!billingReady(env))fail(503,'Pro subscriptions are not open yet. The free tools are available.');const a=await required(r,env);const b=await body(r);if(b.savedKey!==true||b.acceptedTerms!==true)fail(400,'Save your account key and accept the terms first.');if(isPro(a))fail(409,'You already have Pro. Use Manage billing.');const customer=await checkoutCustomer(env,a);await preventDuplicateSubscription(env,a,customer);const pending=await pendingCheckout(env,a,customer);if(pending.url)return json({url:pending.url});const params={mode:'subscription',integration_identifier:'phrase-lane-pro-zqmbtvar','subscription_data[billing_mode][type]':'flexible','line_items[0][price]':env.STRIPE_PRICE_ID,'line_items[0][quantity]':'1',client_reference_id:a.id,'subscription_data[metadata][account_id]':a.id,success_url:`${u.origin}/account?checkout={CHECKOUT_SESSION_ID}`,cancel_url:`${u.origin}/pricing`,allow_promotion_codes:'false'};params.customer=customer;const s=await stripe(env,'checkout/sessions',params,`checkout-${a.id}-${env.STRIPE_PRICE_ID}-${a.subscription||'initial'}-${pending.attempt}`);return json({url:checkoutUrl(s)});}
if(path==='/api/sync'){await throttle(r,env,'sync',10,60);const a=await required(r,env),b=await body(r);if(typeof b.checkout!=='string'||!/^cs_[a-zA-Z0-9_]{10,200}$/.test(b.checkout))fail(400,'Invalid checkout reference.');const s=await stripe(env,`checkout/sessions/${encodeURIComponent(b.checkout)}`);if(s.id!==b.checkout||s.livemode!==(env.BILLING_MODE==='live')||s.client_reference_id!==a.id||s.mode!=='subscription'||s.status!=='complete'||s.payment_status!=='paid'||!s.subscription||typeof stripeId(s.customer)!=='string'||(a.customer&&stripeId(s.customer)!==a.customer))fail(403,'Payment is not confirmed for this account.');const subscription=stripeId(s.subscription);if(typeof subscription!=='string'||!/^sub_[a-zA-Z0-9_]+$/.test(subscription))fail(403,'Invalid subscription reference.');await syncSub(env,subscription,a.id,null,stripeId(s.customer));return json({ok:true});}
if(path==='/api/portal'){await throttle(r,env,'portal',6,60);const a=await required(r,env);if(!a.customer)fail(409,'There is no billing account yet.');const p=await stripe(env,'billing_portal/sessions',{customer:a.customer,return_url:`${u.origin}/account`});return json({url:p.url});}
fail(404,'Not found.');}
export default {async fetch(r,env,ctx){try{const url=new URL(r.url);if(url.pathname.startsWith('/api/'))return await api(r,env,ctx);if(!['GET','HEAD'].includes(r.method))fail(405,'Method not allowed.');let path=url.pathname.replace(/\/$/,'')||'/';if(path==='/robots.txt')return new Response(`User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml`,{headers:secureHeaders('text/plain')});if(path==='/sitemap.xml'){const pages=Object.keys(ASSETS).filter(x=>ASSETS[x].type.startsWith('text/html')&&!['/account','/404'].includes(x));return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(p=>`<url><loc>${url.origin}${p}</loc></url>`).join('')}</urlset>`,{headers:secureHeaders('application/xml')});}
const asset=ASSETS[path]||ASSETS['/404'];let text=asset.content;if(path==='/legal'&&env.LEGAL_READY==='true'){const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));text=text.replace('<!--SELLER-->',`<dl><dt>Seller</dt><dd>${esc(env.SELLER_NAME)}</dd><dt>Business address</dt><dd>${esc(env.SELLER_ADDRESS)}</dd><dt>Telephone</dt><dd>${esc(env.SELLER_PHONE)}</dd><dt>Contact</dt><dd>${esc(env.CONTACT_EMAIL)}</dd></dl>`);}return new Response(r.method==='HEAD'?null:text,{status:ASSETS[path]?200:404,headers:{...secureHeaders(asset.type),'Cache-Control':path==='/legal'?'no-store':'public, max-age=300'}});}catch(e){return json({error:e instanceof HttpError?e.message:'Service temporarily unavailable. Please try again.',code:e instanceof HttpError?e.status:503},e instanceof HttpError?e.status:503);}},async scheduled(event,env){await env.DB.batch([env.DB.prepare('DELETE FROM usage WHERE expires<?').bind(now()),env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now())]);}};
