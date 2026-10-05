import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac,createHash} from 'node:crypto';
import worker,{billingReady} from '../src/worker.mjs';

function setup(t){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('schema.sql','utf8'));
 t.after(()=>db.close());
 const DB={async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}},prepare(sql){return{bind(...args){const s=db.prepare(sql);return{first:async()=>s.get(...args)||null,run:async()=>s.run(...args)};}};}};
 db.prepare('INSERT INTO accounts(id,recovery_hash,created) VALUES(?,?,?)').run('test-account','test-hash',1);
 const sessionToken='a'.repeat(64);db.prepare('INSERT INTO sessions(hash,account_id,expires) VALUES(?,?,?)').run(createHash('sha256').update(sessionToken).digest('hex'),'test-account',Math.floor(Date.now()/1000)+3600);
 const env={DB,QUOTA_SALT:'only-for-tests',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'webhook-test-fixture',STRIPE_PRICE_ID:'price_test_pro',BILLING_MODE:'test',BILLING_ENABLED:'true',BILLING_TESTED:'true',LEGAL_READY:'true',SELLER_NAME:'Test seller',SELLER_ADDRESS:'Test address',SELLER_PHONE:'Test phone',CONTACT_EMAIL:'test@example.test'};
 let calls=0,fail=false,status='active';
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.headers['Stripe-Version'],'2026-08-26.dahlia');if(fail)return Response.json({error:{message:'test unavailable'}},{status:503});assert.match(url,/subscriptions\/sub_test$/);return Response.json({id:'sub_test',livemode:false,customer:'cus_test',status,metadata:{account_id:'test-account'},items:{data:[{price:{id:'price_test_pro'},current_period_end:Math.floor(Date.now()/1000)+86400}]}});};
 t.after(()=>{globalThis.fetch=original;});
 const send=async(event)=>{const raw=JSON.stringify(event),stamp=Math.floor(Date.now()/1000),signature=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${stamp}.${raw}`).digest('hex');return worker.fetch(new Request('https://phrase.test/api/webhook',{method:'POST',headers:{'stripe-signature':`t=${stamp},v1=${signature}`},body:raw}),env);};
 const request=(path,data)=>worker.fetch(new Request('https://phrase.test'+path,{method:data===undefined?'GET':'POST',headers:{Origin:'https://phrase.test','Content-Type':'application/json',Cookie:`__Host-phrase_session=${sessionToken}`,'CF-Connecting-IP':'192.0.2.5'},body:data===undefined?undefined:JSON.stringify(data)}),env);
 return{db,env,send,request,calls:()=>calls,setFailure:value=>fail=value,setStatus:value=>status=value};
}
const subscriptionEvent=(id='evt_sub')=>({id,type:'customer.subscription.updated',livemode:false,data:{object:{id:'sub_test',metadata:{account_id:'test-account'}}}});
test('paid checkout grants the owning account access and duplicate delivery is skipped',async t=>{
 const s=setup(t);const e={id:'evt_checkout',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_fixture',livemode:false,status:'complete',customer:'cus_test',mode:'subscription',payment_status:'paid',subscription:'sub_test',client_reference_id:'test-account'}}};
 assert.equal((await s.send(e)).status,200);assert.equal(s.db.prepare('SELECT status FROM accounts').get().status,'active');assert.equal((await s.send(e)).status,200);assert.equal(s.calls(),1);
});
test('unpaid checkout does not grant access; a later asynchronous success does',async t=>{
 const s=setup(t);const obj={id:'cs_test_fixture',livemode:false,status:'complete',customer:'cus_test',mode:'subscription',payment_status:'unpaid',subscription:'sub_test',client_reference_id:'test-account'};
 assert.equal((await s.send({id:'evt_unpaid',type:'checkout.session.completed',livemode:false,data:{object:obj}})).status,200);assert.equal(s.calls(),0);assert.equal(s.db.prepare('SELECT status FROM accounts').get().status,'free');
 assert.equal((await s.send({id:'evt_paid',type:'checkout.session.async_payment_succeeded',livemode:false,data:{object:{...obj,payment_status:'paid'}}})).status,200);assert.equal(s.calls(),1);
});
test('invoice payment failure and cancellation replace access with latest Stripe state',async t=>{
 const s=setup(t);await s.send(subscriptionEvent());s.setStatus('past_due');
 const e={id:'evt_invoice',type:'invoice.payment_failed',livemode:false,data:{object:{parent:{subscription_details:{subscription:'sub_test'}}}}};
 assert.equal((await s.send(e)).status,200);assert.equal(s.db.prepare('SELECT status FROM accounts').get().status,'past_due');
 s.setStatus('canceled');assert.equal((await s.send({...subscriptionEvent('evt_deleted'),type:'customer.subscription.deleted'})).status,200);assert.equal(s.db.prepare('SELECT status FROM accounts').get().status,'canceled');
});
test('failed synchronization remains retryable and an old delivery reads current state',async t=>{
 const s=setup(t);s.setFailure(true);assert.equal((await s.send(subscriptionEvent())).status,502);assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n,0);
 s.setFailure(false);s.setStatus('canceled');assert.equal((await s.send(subscriptionEvent())).status,200);assert.equal(s.db.prepare('SELECT status FROM accounts').get().status,'canceled');
});
test('wrong live/test mode is rejected and mismatched keys keep checkout closed',async t=>{
 const s=setup(t);assert.equal((await s.send({...subscriptionEvent(),livemode:true})).status,400);assert.equal(s.calls(),0);assert.equal(billingReady(s.env),true);assert.equal(billingReady({...s.env,STRIPE_SECRET_KEY:'sk_live_fixture'}),false);assert.equal(billingReady({...s.env,BILLING_MODE:undefined}),false);
});
test('invoice arriving first resolves its owner from the current subscription',async t=>{
 const s=setup(t);
 const e={id:'evt_invoice_first',type:'invoice.paid',livemode:false,data:{object:{parent:{subscription_details:{subscription:'sub_test'}}}}};
 assert.equal((await s.send(e)).status,200);
 assert.equal(s.db.prepare('SELECT subscription,status FROM accounts').get().subscription,'sub_test');
 assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n,1);
 assert.equal((await s.send(e)).status,200);assert.equal(s.calls(),1);
});
test('missing owner is retryable and never recorded as completed',async t=>{
 const s=setup(t);s.db.prepare('DELETE FROM accounts').run();
 assert.equal((await s.send(subscriptionEvent())).status,503);
 assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n,0);
 s.db.prepare('INSERT INTO accounts(id,recovery_hash,created) VALUES(?,?,?)').run('test-account','test-hash',1);
 assert.equal((await s.send(subscriptionEvent())).status,200);
});
test('wrong key mode prevents Stripe requests even for a signed webhook',async t=>{
 const s=setup(t);s.env.STRIPE_SECRET_KEY='sk_live_fixture';
 assert.equal((await s.send(subscriptionEvent())).status,503);assert.equal(s.calls(),0);
 assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n,0);
});
test('current subscription ownership, price and environment are checked',async t=>{
 const s=setup(t);
 for(const override of [{metadata:{account_id:'another-account'}},{items:{data:[{price:{id:'price_other'}}]}},{livemode:true}]){
  globalThis.fetch=async()=>Response.json({id:'sub_test',livemode:false,customer:'cus_test',status:'active',metadata:{account_id:'test-account'},items:{data:[{price:{id:'price_test_pro'},current_period_end:9999999999}]},...override});
  assert.equal((await s.send(subscriptionEvent())).status,403);
  assert.equal(s.db.prepare('SELECT status FROM accounts').get().status,'free');
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n,0);
 }
});
test('completion write failure rolls back access and remains retryable',async t=>{
 const s=setup(t);s.db.exec("CREATE TRIGGER fail_completion BEFORE INSERT ON stripe_events BEGIN SELECT RAISE(ABORT,'test write failure'); END");
 assert.equal((await s.send(subscriptionEvent())).status,503);
 assert.equal(s.db.prepare('SELECT status FROM accounts').get().status,'free');
 assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n,0);
 s.db.exec('DROP TRIGGER fail_completion');assert.equal((await s.send(subscriptionEvent())).status,200);
});

const fixtureSub=(override={})=>({id:'sub_test',livemode:false,customer:'cus_test',status:'active',metadata:{account_id:'test-account'},items:{data:[{price:{id:'price_test_pro'},current_period_end:Math.floor(Date.now()/1000)+86400}]},...override});
const paidCheckout=(override={})=>({id:'cs_test_checkout_fixture',livemode:false,client_reference_id:'test-account',mode:'subscription',status:'complete',payment_status:'paid',subscription:'sub_test',customer:'cus_test',...override});
const checkoutBody={savedKey:true,acceptedTerms:true};
test('Pro requires an active, unexpired subscription and account exposes monthly quota and billing recovery',async t=>{
 const s=setup(t);s.db.prepare('UPDATE accounts SET customer=?,subscription=?,valid_until=?').run('cus_test','sub_test',Math.floor(Date.now()/1000)+86400);
 for(const status of ['trialing','past_due','unpaid','paused','canceled','incomplete','incomplete_expired']){
  s.db.prepare('UPDATE accounts SET status=?').run(status);
  const a=await(await s.request('/api/account')).json();assert.equal(a.plan,'free');assert.equal(a.billingPortalAvailable,true);
 }
 s.db.prepare("UPDATE accounts SET status='active'").run();
 const a=await(await s.request('/api/account')).json();assert.equal(a.plan,'pro');assert.equal(a.limit,50000);assert.equal(a.quotaPeriod.timezone,'UTC');assert.equal(new Date(a.quotaPeriod.start*1000).getUTCDate(),1);assert.equal(new Date(a.quotaPeriod.resetsAt*1000).getUTCDate(),1);assert.ok(a.quotaPeriod.resetsAt>a.quotaPeriod.start);assert.equal(a.proDailyRequestLimit,100);assert.equal(a.proMaxChars,1000);
 s.db.prepare('UPDATE accounts SET valid_until=1').run();assert.equal((await(await s.request('/api/account')).json()).plan,'free');
});
test('an unrelated price cannot extend the paid feature period',async t=>{
 const s=setup(t),paidEnd=Math.floor(Date.now()/1000)+300;
 globalThis.fetch=async()=>Response.json(fixtureSub({current_period_end:9999999999,items:{data:[{price:{id:'price_test_pro'},current_period_end:paidEnd},{price:{id:'price_other'},current_period_end:9999999999}]}}));
 assert.equal((await s.send(subscriptionEvent())).status,200);assert.equal(s.db.prepare('SELECT valid_until FROM accounts').get().valid_until,paidEnd);
});
test('a matching price with a missing period does not gain a period from another product',async t=>{
 const s=setup(t);globalThis.fetch=async()=>Response.json(fixtureSub({items:{data:[{price:{id:'price_test_pro'}},{price:{id:'price_other'},current_period_end:9999999999}]}}));
 assert.equal((await s.send(subscriptionEvent())).status,200);assert.equal((await(await s.request('/api/account')).json()).plan,'free');
});
test('subscription metadata cannot move an account to a different Stripe customer',async t=>{
 const s=setup(t);s.db.prepare('UPDATE accounts SET customer=?').run('cus_owned');
 assert.equal((await s.send(subscriptionEvent())).status,403);assert.equal(s.db.prepare('SELECT customer,status FROM accounts').get().customer,'cus_owned');assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n,0);
});
test('checkout sync checks session environment, identity and customer before subscription retrieval',async t=>{
 const s=setup(t);s.db.prepare('UPDATE accounts SET customer=?').run('cus_test');
 for(const override of [{livemode:true},{id:'cs_test_another_fixture'},{client_reference_id:'another-account'},{customer:'cus_other'},{customer:null}]){
  globalThis.fetch=async url=>{assert.match(url,/checkout\/sessions\/cs_test_checkout_fixture$/);return Response.json(paidCheckout(override));};
  assert.equal((await s.request('/api/sync',{checkout:'cs_test_checkout_fixture'})).status,403);
  assert.equal(s.db.prepare('SELECT status FROM accounts').get().status,'free');
 }
});
test('checkout and subscription customer must match even before initial database linking',async t=>{
 const s=setup(t);globalThis.fetch=async url=>Response.json(url.includes('checkout/sessions')?paidCheckout({customer:'cus_other'}):fixtureSub());
 assert.equal((await s.request('/api/sync',{checkout:'cs_test_checkout_fixture'})).status,403);assert.equal(s.db.prepare('SELECT customer FROM accounts').get().customer,null);
});
test('completed checkout sync restores access using the verified owner and customer',async t=>{
 const s=setup(t);globalThis.fetch=async url=>Response.json(url.includes('checkout/sessions')?paidCheckout():fixtureSub());
 assert.equal((await s.request('/api/sync',{checkout:'cs_test_checkout_fixture'})).status,200);assert.equal((await(await s.request('/api/account')).json()).plan,'pro');
});
test('a stale subscription event cannot replace the account newer subscription',async t=>{
 const s=setup(t);s.db.prepare("UPDATE accounts SET customer='cus_test',subscription='sub_new',status='active',valid_until=9999999999").run();s.setStatus('canceled');
 assert.equal((await s.send(subscriptionEvent())).status,200);assert.equal(s.db.prepare('SELECT subscription,status FROM accounts').get().subscription,'sub_new');assert.equal(s.db.prepare('SELECT status FROM accounts').get().status,'active');
 s.setStatus('active');assert.equal((await s.send(subscriptionEvent('evt_other_active'))).status,409);
});
test('a replacement subscription can start after the old one ended on the same customer',async t=>{
 const s=setup(t);s.db.prepare("UPDATE accounts SET customer='cus_test',subscription='sub_previous',status='canceled'").run();
 assert.equal((await s.send(subscriptionEvent())).status,200);assert.equal(s.db.prepare('SELECT subscription FROM accounts').get().subscription,'sub_test');
});
test('an expired local entitlement does not allow a second existing subscription',async t=>{
 const s=setup(t);s.db.prepare("UPDATE accounts SET customer='cus_test',subscription='sub_test',status='active',valid_until=1").run();
 assert.equal((await s.request('/api/checkout',checkoutBody)).status,409);assert.equal(s.calls(),1);
});
test('Stripe subscription history blocks duplicates while the first webhook is pending',async t=>{
 const s=setup(t);s.db.prepare("UPDATE accounts SET customer='cus_test'").run();
 globalThis.fetch=async url=>{assert.match(url,/subscriptions\?customer=cus_test&status=all&limit=100$/);return Response.json({data:[fixtureSub({status:'past_due'})],has_more:false});};
 assert.equal((await s.request('/api/checkout',checkoutBody)).status,409);
});
test('an unrelated product does not prevent an owned Pro checkout',async t=>{
 const s=setup(t);s.db.prepare("UPDATE accounts SET customer='cus_test'").run();let created=0;
 globalThis.fetch=async(url,options)=>{
  if(url.includes('subscriptions?'))return Response.json({data:[fixtureSub({items:{data:[{price:{id:'price_other'}}]}})],has_more:false});
  if(url.includes('checkout/sessions?'))return Response.json({data:[],has_more:false});
  assert.match(url,/checkout\/sessions$/);created++;const p=new URLSearchParams(options.body);assert.equal(p.get('customer'),'cus_test');assert.equal(p.get('line_items[0][price]'),'price_test_pro');assert.equal(p.get('client_reference_id'),'test-account');assert.equal(p.has('payment_method_types'),false);return Response.json({url:'https://checkout.stripe.com/test-session'});
 };
 assert.equal((await s.request('/api/checkout',checkoutBody)).status,200);assert.equal(created,1);
});
test('initial checkout establishes a customer mapping before creating the payment session',async t=>{
 const s=setup(t);const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push(url);
  if(url.endsWith('/customers')){assert.equal(options.headers['Idempotency-Key'],'phrase-customer-test-account');return Response.json({id:'cus_test',livemode:false});}
  if(url.includes('subscriptions?')||url.includes('checkout/sessions?'))return Response.json({data:[],has_more:false});
  assert.match(url,/checkout\/sessions$/);assert.equal(s.db.prepare('SELECT customer FROM accounts').get().customer,'cus_test');return Response.json({url:'https://checkout.stripe.com/test-session'});
 };
 assert.equal((await s.request('/api/checkout',checkoutBody)).status,200);assert.equal(calls.length,4);
});
test('JSON null, arrays and primitive bodies return input errors on object APIs',async t=>{
 const s=setup(t);
 for(const path of ['/api/login','/api/checkout','/api/sync','/api/translate'])for(const input of [null,[],42])assert.equal((await s.request(path,input)).status,400,`${path} ${JSON.stringify(input)}`);
});
test('a signed checkout with a mismatched nested environment or customer is rejected',async t=>{
 const s=setup(t);
 for(const override of [{livemode:true},{status:'open'},{customer:null}]){
  const e={id:'evt_bad_checkout',type:'checkout.session.completed',livemode:false,data:{object:paidCheckout(override)}};
  assert.equal((await s.send(e)).status,400);assert.equal(s.calls(),0);
 }
 assert.equal((await s.send({id:'evt_bad_owner_checkout',type:'checkout.session.completed',livemode:false,data:{object:paidCheckout({customer:'cus_other'})}})).status,403);
});

test('concurrent initial checkout and retries share Customer and Checkout idempotency keys',async t=>{
 const s=setup(t),customerKeys=new Set(),checkoutKeys=new Set();let customerRequests=0,releaseCustomers;const customersReady=new Promise(resolve=>{releaseCustomers=resolve;});
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/customers')){customerRequests++;customerKeys.add(options.headers['Idempotency-Key']);if(customerRequests===2)releaseCustomers();await customersReady;return Response.json({id:'cus_test',livemode:false});}
  if(url.includes('subscriptions?')||url.includes('checkout/sessions?'))return Response.json({data:[],has_more:false});
  assert.match(url,/checkout\/sessions$/);checkoutKeys.add(options.headers['Idempotency-Key']);return Response.json({url:'https://checkout.stripe.com/same-session'});
 };
 const results=await Promise.all([s.request('/api/checkout',checkoutBody),s.request('/api/checkout',checkoutBody)]);
 assert.ok(results.every(r=>r.status===200));assert.equal(customerKeys.size,1);assert.equal(checkoutKeys.size,1);assert.equal(customerRequests,2);
 assert.equal((await s.request('/api/checkout',checkoutBody)).status,200);assert.equal(customerRequests,2);assert.equal(checkoutKeys.size,1);
});
test('a still-open owned checkout is reused across request retries',async t=>{
 const s=setup(t);s.db.prepare("UPDATE accounts SET customer='cus_test'").run();let creates=0;
 globalThis.fetch=async(url,options)=>{
  if(url.includes('subscriptions?'))return Response.json({data:[],has_more:false});
  if(url.includes('checkout/sessions?'))return Response.json({data:[paidCheckout({status:'open',payment_status:'unpaid',subscription:null,url:'https://checkout.stripe.com/existing-session',expires_at:Math.floor(Date.now()/1000)+3600,line_items:{data:[{price:{id:'price_test_pro'},quantity:1}],has_more:false}})],has_more:false});
  creates++;return Response.json({url:'https://checkout.stripe.com/unexpected'});
 };
 const r=await s.request('/api/checkout',checkoutBody);assert.equal(r.status,200);assert.equal((await r.json()).url,'https://checkout.stripe.com/existing-session');assert.equal(creates,0);
});
test('concurrent subscription replacement cannot be overwritten after the ownership read',async t=>{
 const s=setup(t);s.db.prepare("UPDATE accounts SET customer='cus_test',subscription='sub_previous',status='canceled'").run();
 const batch=s.env.DB.batch;
 s.env.DB.batch=async statements=>{
  s.db.prepare("UPDATE accounts SET customer='cus_test',subscription='sub_newer',status='active',valid_until=9999999999").run();
  return batch(statements);
 };
 assert.equal((await s.send(subscriptionEvent())).status,409);
 assert.equal(s.db.prepare('SELECT subscription FROM accounts').get().subscription,'sub_newer');assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n,0);
});

test('checkout idempotency remains stable across hour boundaries before webhook linkage',async t=>{
 const s=setup(t),keys=new Set();s.db.prepare("UPDATE accounts SET customer='cus_test'").run();s.db.prepare('UPDATE sessions SET expires=9999999999').run();
 const clock=Date.now;t.after(()=>{Date.now=clock;});
 globalThis.fetch=async(url,options)=>{
  if(url.includes('subscriptions?')||url.includes('checkout/sessions?'))return Response.json({data:[],has_more:false});
  keys.add(options.headers['Idempotency-Key']);return Response.json({url:'https://checkout.stripe.com/same-session'});
 };
 assert.equal((await s.request('/api/checkout',checkoutBody)).status,200);Date.now=()=>clock()+3600001;
 assert.equal((await s.request('/api/checkout',checkoutBody)).status,200);assert.equal(keys.size,1);
});
