import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import worker, {mvpBillingReady, serviceReady, mvpCheckout, mvpWebhook, mvpGetUsage} from '../src/worker.mjs';

function setup(t) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema-mvp.sql', import.meta.url), 'utf8'));
  db.exec('PRAGMA foreign_keys=ON');
  t.after(() => db.close());
  let beforeBatch;
  const DB = {
    prepare(sql) {
      const create = (args = []) => ({
        bind: (...values) => create(values),
        first: async () => db.prepare(sql).get(...args) || null,
        all: async () => ({results: db.prepare(sql).all(...args)}),
        run: async () => ({meta: db.prepare(sql).run(...args)})
      });
      return create();
    },
    async batch(statements) {
      if (beforeBatch) { const hook = beforeBatch; beforeBatch = null; hook(); }
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  db.prepare('INSERT INTO accounts(id,recovery_hash,created) VALUES(?,?,?)').run('account_one', 'recovery_one', 1);
  const env = {
    DB, QUOTA_SALT:'test-only-salt', RESULT_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),
    MVP_ENABLED:'true', MIGRATION_VERIFIED:'true', SITE_ORIGIN:'https://phrase.test',
    AI_ENABLED:'true', AI_PROVIDER:'cloudflare', AI:{run:async () => {throw new Error('No AI call expected');}},
    TRANSLATION_MODEL:'translation-test', TRANSCRIPTION_MODEL:'transcription-test',
    AI_INPUT_USD_PER_MILLION:'1', AI_OUTPUT_USD_PER_MILLION:'1', ASR_USD_PER_MINUTE:'1',
    PRO_MONTHLY_BUDGET_USD:'10', FREE_MONTHLY_BUDGET_USD:'2',
    GOOGLE_CLIENT_ID:'client-test', GOOGLE_CLIENT_SECRET:'secret-test', TURNSTILE_SITE_KEY:'site-test', TURNSTILE_SECRET_KEY:'turnstile-test',
    BILLING_ENABLED:'true', BILLING_TESTED:'true', LEGAL_READY:'true', BILLING_MODE:'test',
    STRIPE_SECRET_KEY:'rk_test_fixture', STRIPE_WEBHOOK_SECRET:'test-webhook-secret', STRIPE_PRICE_ID:'price_pro', STRIPE_PRODUCT_ID:'prod_pro',
    SELLER_NAME:'Test seller', SELLER_ADDRESS:'Test business address', SELLER_PHONE:'Test business phone', CONTACT_EMAIL:'test@example.test'
  };
  const calls = [], routes = new Map(), originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    assert.equal(u.origin, 'https://api.stripe.com');
    assert.equal(options.headers['Stripe-Version'], '2026-08-26.dahlia');
    calls.push({url:u, options});
    const response = routes.get(`${options.method || 'GET'} ${u.pathname}`);
    assert.ok(response, `Unexpected Stripe request: ${options.method || 'GET'} ${u.pathname}`);
    return Response.json(typeof response === 'function' ? await response(u, options) : response);
  };
  t.after(() => {globalThis.fetch = originalFetch;});
  routes.set('GET /v1/prices/price_pro', {id:'price_pro', product:'prod_pro', livemode:false, active:true, currency:'usd', unit_amount:900, recurring:{interval:'month',interval_count:1}});
  const sub = (id='sub_one', status='active', extra={}) => ({id, status, livemode:false, customer:'cus_one', metadata:{account_id:'account_one'}, items:{data:[{id:'si_one',quantity:1,price:{id:'price_pro', product:'prod_pro'}}]}, ...extra});
  routes.set('GET /v1/subscriptions/sub_one', sub());
  const now = Math.floor(Date.now()/1000), start = now - 10, end = start + 30*86400;
  const invoice = (extra={}) => ({id:'in_one',livemode:false,customer:'cus_one',currency:'usd',amount_paid:900,status:'paid',paid:true,billing_reason:'subscription_create',parent:{type:'subscription_details',subscription_details:{subscription:'sub_one'}},lines:{has_more:false,data:[{id:'il_one',quantity:1,pricing:{price_details:{price:'price_pro'}},parent:{subscription_item_details:{subscription:'sub_one',proration:false}},period:{start,end}}]},...extra});
  routes.set('GET /v1/invoices/in_one', invoice());
  const send = async (type='invoice.paid', id='evt_one', objectId='in_one', extra={}) => {
    const event = {id,type,livemode:false,data:{object:{id:objectId}},...extra};
    const raw = JSON.stringify(event), stamp = Math.floor(Date.now()/1000);
    const signature = createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${stamp}.${raw}`).digest('hex');
    return mvpWebhook(new Request('https://phrase.test/api/webhook',{method:'POST',headers:{'stripe-signature':`t=${stamp},v1=${signature}`},body:raw}),env);
  };
  return {db,env,routes,calls,sub,invoice,send,start,end,account:() => db.prepare('SELECT * FROM accounts WHERE id=?').get('account_one'),race:hook => {beforeBatch=hook;}};
}
const rejectsStatus = (promise,status) => assert.rejects(promise,error => error.status===status);

test('MVP checkout opens only with usable service, both budgets, legal data and matching key mode', t => {
  const s=setup(t);
  assert.equal(mvpBillingReady(s.env),true);
  for (const override of [{DB:null},{QUOTA_SALT:''},{FREE_MONTHLY_BUDGET_USD:undefined},{PRO_MONTHLY_BUDGET_USD:'Infinity'},{RESULT_ENCRYPTION_KEY:'invalid'},{AI_ENABLED:'false'},{MIGRATION_VERIFIED:'false'},{GOOGLE_CLIENT_SECRET:''},{TURNSTILE_SITE_KEY:''},{SELLER_NAME:'   '},{BILLING_TESTED:'false'},{STRIPE_SECRET_KEY:'rk_live_fixture'},{SITE_ORIGIN:'https://phrase.test/path'}]) {
    assert.equal(mvpBillingReady({...s.env,...override}),false,JSON.stringify(override));
  }
  assert.equal(serviceReady({...s.env,BILLING_ENABLED:'false'}),true);
});

test('simultaneous first Checkouts reuse persisted idempotency and never create a second reservation',async t => {
  const s=setup(t), keys=[];
  s.routes.set('POST /v1/checkout/sessions',(_url,options) => {
    keys.push(options.headers['Idempotency-Key']);
    const p=options.body;
    assert.match(p.get('integration_identifier'),/^phrase-lane-[a-z]{8}$/);
    assert.equal(p.get('client_reference_id'),'account_one');
    assert.equal(p.get('line_items[0][price]'),'price_pro');
    return {id:'cs_one',status:'open',mode:'subscription',livemode:false,client_reference_id:'account_one',customer:null,url:'https://checkout.stripe.com/c/pay/cs_one'};
  });
  s.routes.set('GET /v1/checkout/sessions/cs_one',{id:'cs_one',status:'open',mode:'subscription',livemode:false,client_reference_id:'account_one',customer:null,url:'https://checkout.stripe.com/c/pay/cs_one'});
  const body={plan:'pro',acceptedTerms:true};
  const results=await Promise.all([mvpCheckout(s.env,s.account(),body),mvpCheckout(s.env,s.account(),body)]);
  assert.deepEqual(results[0],results[1]);
  assert.equal(new Set(keys).size,1);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM checkout_reservations').get().n,1);
  assert.deepEqual(await mvpCheckout(s.env,s.account(),body),results[0]);
});

test('existing active subscription and invalid checkout bodies cannot start a second purchase',async t => {
  const s=setup(t);
  for (const body of [null,[],0,'pro']) await rejectsStatus(mvpCheckout(s.env,s.account(),body),400);
  assert.equal(s.calls.length,0);
  s.db.prepare('UPDATE accounts SET customer=?,subscription=?,status=?').run('cus_one','sub_one','active');
  await rejectsStatus(mvpCheckout(s.env,s.account(),{plan:'pro',acceptedTerms:true}),409);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM checkout_reservations').get().n,0);
});

test('invoice-first webhook atomically grants the matching paid period once',async t => {
  const s=setup(t);
  const invoice=s.invoice();
  invoice.lines.data.unshift({quantity:1,price:{id:'price_unrelated'},period:{start:1,end:9999999999}});
  s.routes.set('GET /v1/invoices/in_one',invoice);
  await s.send();
  const grant=s.db.prepare('SELECT * FROM paid_period_grants').get();
  assert.equal(grant.period_start,s.start*1000);
  assert.equal(grant.period_end,s.end*1000);
  assert.deepEqual([grant.audio_limit,grant.text_limit,grant.audio_attempt_limit,grant.text_attempt_limit],[7200,50000,600,500]);
  assert.equal(s.account().subscription,'sub_one');
  assert.equal(s.account().valid_until,s.end);
  const usage=await mvpGetUsage(s.env,s.account());
  assert.equal(usage.plan,'pro');
  assert.equal(usage.startsAt,s.start*1000);
  assert.equal(usage.endsAt,s.end*1000);
  assert.equal(usage.audio.limit,7200);
  assert.equal(usage.text.limit,50000);
  const before=s.calls.length;
  await s.send();
  assert.equal(s.calls.length,before);
  await s.send('invoice.paid','evt_duplicate');
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM paid_period_grants').get().n,1);
});

test('invoice customer, environment and duplicate plan lines fail without paid grants',async t => {
  const s=setup(t), ordinary=s.invoice();
  for(const [i,invoice] of [s.invoice({customer:'cus_foreign'}),s.invoice({livemode:true}),s.invoice({lines:{has_more:false,data:[...ordinary.lines.data,...ordinary.lines.data]}})].entries()) {
    s.routes.set('GET /v1/invoices/in_one',invoice);
    await rejectsStatus(s.send('invoice.paid',`evt_bad_${i}`),403);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM paid_period_grants').get().n,0);
    assert.equal(s.account().subscription,null);
  }
});

test('concurrent subscription replacement cannot be rolled back or granted by a stale invoice',async t => {
  const s=setup(t);
  s.race(() => s.db.prepare('UPDATE accounts SET customer=?,subscription=?,status=?').run('cus_one','sub_new','active'));
  await rejectsStatus(s.send(),409);
  assert.equal(s.account().subscription,'sub_new');
  assert.equal(s.account().valid_until,0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM paid_period_grants').get().n,0);
  assert.equal(s.db.prepare('SELECT status FROM billing_events').get().status,'pending');
  s.routes.set('GET /v1/subscriptions/sub_one',s.sub('sub_one','canceled'));
  s.routes.set('GET /v1/subscriptions/sub_new',s.sub('sub_new'));
  await s.send();
  assert.equal(s.account().subscription,'sub_new');
  assert.equal(s.db.prepare('SELECT status FROM billing_events').get().status,'processed');
});

test('delayed terminal subscription cannot replace even another terminal subscription',async t => {
  const s=setup(t);
  s.db.prepare('UPDATE accounts SET customer=?,subscription=?,status=?').run('cus_one','sub_new','canceled');
  s.routes.set('GET /v1/subscriptions/sub_new',s.sub('sub_new','canceled'));
  s.routes.set('GET /v1/subscriptions/sub_one',s.sub('sub_one','canceled'));
  await s.send('customer.subscription.deleted','evt_old','sub_one');
  assert.equal(s.account().subscription,'sub_new');
});

test('ledger completion failure rolls back account, quota grant and metrics together',async t => {
  const s=setup(t);
  s.db.exec("CREATE TRIGGER test_fail_completion BEFORE UPDATE OF status ON billing_events WHEN NEW.status='processed' BEGIN SELECT RAISE(ABORT,'completion failed'); END");
  await assert.rejects(s.send(),/completion failed/);
  assert.equal(s.account().subscription,null);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM paid_period_grants').get().n,0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM payment_metrics').get().n,0);
  assert.equal(s.db.prepare('SELECT status FROM billing_events').get().status,'pending');
  s.db.exec('DROP TRIGGER test_fail_completion');
  await s.send();
  assert.equal(s.account().subscription,'sub_one');
});

test('Checkout completion verifies the retrieved session customer before linking an account',async t => {
  const s=setup(t);
  s.routes.set('GET /v1/checkout/sessions/cs_one',{id:'cs_one',mode:'subscription',livemode:false,customer:'cus_foreign',subscription:'sub_one',client_reference_id:'account_one'});
  await rejectsStatus(s.send('checkout.session.completed','evt_checkout','cs_one'),403);
  assert.equal(s.account().subscription,null);
});

test('modern full refund resolves Invoice Payments, cancels only its subscription and cannot be re-granted',async t => {
  const s=setup(t);
  await s.send();
  s.routes.set('GET /v1/charges/ch_one',{id:'ch_one',livemode:false,payment_intent:'pi_one',customer:'cus_one',currency:'usd',amount:900,amount_refunded:900,refunded:true});
  s.routes.set('GET /v1/invoice_payments',url => {
    assert.equal(url.searchParams.get('payment[type]'),'payment_intent');
    assert.equal(url.searchParams.get('payment[payment_intent]'),'pi_one');
    assert.equal(url.searchParams.get('status'),'paid');
    return {has_more:false,data:[{id:'inpay_one',invoice:'in_one',livemode:false,status:'paid',payment:{type:'payment_intent',payment_intent:'pi_one'}}]};
  });
  s.routes.set('DELETE /v1/subscriptions/sub_one',() => {
    const sub=s.sub('sub_one','canceled');s.routes.set('GET /v1/subscriptions/sub_one',sub);return sub;
  });
  await s.send('charge.refunded','evt_refund','ch_one');
  assert.equal(s.account().status,'canceled');
  const canceledUntil=s.account().valid_until;
  assert.ok(s.db.prepare('SELECT revoked_at FROM paid_period_grants').get().revoked_at);
  assert.equal(s.db.prepare('SELECT refunds FROM payment_metrics').get().refunds,900);
  await s.send('invoice.paid','evt_late_paid');
  assert.equal(s.account().valid_until,canceledUntil);
  assert.ok(s.db.prepare('SELECT revoked_at FROM paid_period_grants').get().revoked_at);
  assert.equal(s.calls.filter(call=>call.options.method==='DELETE').length,1);
});

test('ambiguous refund invoice mapping remains pending without cancellation',async t => {
  const s=setup(t);
  await s.send();
  s.routes.set('GET /v1/charges/ch_one',{id:'ch_one',livemode:false,payment_intent:'pi_one',customer:'cus_one',currency:'usd',amount:900,amount_refunded:900,refunded:true});
  s.routes.set('GET /v1/invoice_payments',{has_more:true,data:[]});
  await rejectsStatus(s.send('charge.refunded','evt_refund','ch_one'),503);
  assert.equal(s.account().status,'active');
  assert.equal(s.db.prepare('SELECT revoked_at FROM paid_period_grants').get().revoked_at,null);
  assert.equal(s.db.prepare("SELECT status FROM billing_events WHERE event_id='evt_refund'").get().status,'pending');
});

test('unrelated non-invoice refund is acknowledged without touching the app ledger',async t => {
  const s=setup(t);
  s.routes.set('GET /v1/charges/ch_other',{id:'ch_other',livemode:false,payment_intent:'pi_other'});
  s.routes.set('GET /v1/invoice_payments',{has_more:false,data:[]});
  await s.send('charge.refunded','evt_other','ch_other');
  assert.equal(s.account().status,'free');
  assert.equal(s.db.prepare('SELECT status FROM billing_events').get().status,'processed');
});

test('signed wrong-mode event is rejected before Stripe calls',async t => {
  const s=setup(t);
  await rejectsStatus(s.send('invoice.paid','evt_wrong','in_one',{livemode:true}),400);
  assert.equal(s.calls.length,0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM billing_events').get().n,0);
});

test('paid invoice with trialing or unconfirmed status remains pending without entitlement',async t => {
  const s=setup(t);
  for(const status of ['trialing','incomplete','past_due','unpaid','paused']) {
    s.routes.set('GET /v1/subscriptions/sub_one',s.sub('sub_one',status));
    await rejectsStatus(s.send('invoice.paid',`evt_${status}`),503);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM paid_period_grants').get().n,0);
  }
  s.routes.set('GET /v1/subscriptions/sub_one',s.sub());
  await s.send('invoice.paid','evt_incomplete');
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM paid_period_grants').get().n,1);
});

test('unpaid subscription revokes paid allowance while historical payment records remain',async t => {
  const s=setup(t);
  await s.send();
  s.routes.set('GET /v1/subscriptions/sub_one',s.sub('sub_one','unpaid'));
  await s.send('customer.subscription.updated','evt_unpaid','sub_one');
  assert.equal((await mvpGetUsage(s.env,s.account())).plan,'free');
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM payment_metrics').get().n,1);
});

test('public sale and processing status follows runtime readiness and legal fields are escaped',async t => {
  const s=setup(t);
  const page=async(path,env=s.env) => {
    const response=await worker.fetch(new Request(`https://phrase.test${path}`),env);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    return response.text();
  };
  assert.match(await page('/pricing'),/Pro purchases are available/);
  assert.match(await page('/pricing',{...s.env,BILLING_ENABLED:'false'}),/Pro purchases are currently unavailable/);
  assert.match(await page('/',{...s.env,AI_ENABLED:'false'}),/Text and audio translation are currently unavailable/);
  const legal=await page('/legal',{...s.env,SELLER_NAME:'Test <seller> & operator'});
  assert.match(legal,/Test &lt;seller&gt; &amp; operator/);
  assert.doesNotMatch(legal,/Test <seller>/);
  const incomplete=await page('/legal',{...s.env,SELLER_PHONE:''});
  assert.doesNotMatch(incomplete,/<dt>Seller<\/dt>/);
});
