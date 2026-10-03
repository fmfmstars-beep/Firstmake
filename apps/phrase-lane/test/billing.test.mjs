import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import worker,{billingReady} from '../src/worker.mjs';

function setup(t){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('schema.sql','utf8'));
 t.after(()=>db.close());
 const DB={async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}},prepare(sql){return{bind(...args){const s=db.prepare(sql);return{first:async()=>s.get(...args)||null,run:async()=>s.run(...args)};}};}};
 db.prepare('INSERT INTO accounts(id,recovery_hash,created) VALUES(?,?,?)').run('test-account','test-hash',1);
 const env={DB,QUOTA_SALT:'only-for-tests',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'webhook-test-fixture',STRIPE_PRICE_ID:'price_test_pro',BILLING_MODE:'test',BILLING_ENABLED:'true',BILLING_TESTED:'true',LEGAL_READY:'true',SELLER_NAME:'Test seller',SELLER_ADDRESS:'Test address',SELLER_PHONE:'Test phone',CONTACT_EMAIL:'test@example.test'};
 let calls=0,fail=false,status='active';
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.headers['Stripe-Version'],'2026-08-26.dahlia');if(fail)return Response.json({error:{message:'test unavailable'}},{status:503});assert.match(url,/subscriptions\/sub_test$/);return Response.json({id:'sub_test',livemode:false,customer:'cus_test',status,metadata:{account_id:'test-account'},items:{data:[{price:{id:'price_test_pro'},current_period_end:Math.floor(Date.now()/1000)+86400}]}});};
 t.after(()=>{globalThis.fetch=original;});
 const send=async(event)=>{const raw=JSON.stringify(event),stamp=Math.floor(Date.now()/1000),signature=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${stamp}.${raw}`).digest('hex');return worker.fetch(new Request('https://phrase.test/api/webhook',{method:'POST',headers:{'stripe-signature':`t=${stamp},v1=${signature}`},body:raw}),env);};
 return{db,env,send,calls:()=>calls,setFailure:value=>fail=value,setStatus:value=>status=value};
}
const subscriptionEvent=(id='evt_sub')=>({id,type:'customer.subscription.updated',livemode:false,data:{object:{id:'sub_test',metadata:{account_id:'test-account'}}}});
test('paid checkout grants the owning account access and duplicate delivery is skipped',async t=>{
 const s=setup(t);const e={id:'evt_checkout',type:'checkout.session.completed',livemode:false,data:{object:{mode:'subscription',payment_status:'paid',subscription:'sub_test',client_reference_id:'test-account'}}};
 assert.equal((await s.send(e)).status,200);assert.equal(s.db.prepare('SELECT status FROM accounts').get().status,'active');assert.equal((await s.send(e)).status,200);assert.equal(s.calls(),1);
});
test('unpaid checkout does not grant access; a later asynchronous success does',async t=>{
 const s=setup(t);const obj={mode:'subscription',payment_status:'unpaid',subscription:'sub_test',client_reference_id:'test-account'};
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
