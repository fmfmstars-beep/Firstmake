import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
const env = {SITE_ORIGIN:'https://phrase.test',MVP_ENABLED:'true'};
test('cross-origin browser reads are rejected before accessing customer data', async () => {
  for (const headers of [
    {Origin:'https://attacker.test'},
    {Origin:'null'},
    {'Sec-Fetch-Site':'cross-site'},
    {'Sec-Fetch-Site':'same-site'},
  ]) {
    const r = await worker.fetch(new Request('https://phrase.test/api/admin/customers',{headers}),env,{});
    assert.equal(r.status,403);
    assert.match((await r.json()).error,/Cross-origin/);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
    assert.equal(r.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
    assert.equal(r.headers.get('Cache-Control'),'no-store');
  }
});
test('unauthenticated clients cannot bypass account checks by omitting browser headers', async () => {
  for (const path of ['/api/admin/customers','/api/admin/revenue']) {
    const r = await worker.fetch(new Request('https://phrase.test'+path),env,{});
    assert.equal(r.status,401);
    assert.equal(r.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
    assert.equal(r.headers.get('Cache-Control'),'no-store');
  }
});
test('OAuth callback navigation reaches auth validation, not browser origin rejection', async () => {
  const r = await worker.fetch(new Request('https://phrase.test/api/auth/callback',{
    headers:{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate'}
  }),env,{});
  assert.notEqual(r.status,200);
  assert.doesNotMatch(await r.text(),/Cross-origin API access/);
});
test('server webhook requests still require a valid signature', async () => {
  const r = await worker.fetch(new Request('https://phrase.test/api/webhook',{
    method:'POST',body:'{}',headers:{'Content-Type':'application/json'}
  }),{...env,DB:{prepare(){throw new Error('Unsigned request must never access DB');}},
    BILLING_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',
    STRIPE_PRICE_ID:'price_fixture',STRIPE_PRODUCT_ID:'prod_fixture',
    STRIPE_WEBHOOK_SECRET:'test-only-signing-secret'},{});
  assert.equal(r.status,400);
  assert.match((await r.json()).error,/signature/i);
});
test('same-origin public API responses cannot be cached or embedded cross-origin', async () => {
  const r = await worker.fetch(new Request('https://phrase.test/api/config',{headers:{Origin:env.SITE_ORIGIN,'Sec-Fetch-Site':'same-origin'}}),env,{});
  assert.equal(r.status,200);
  assert.equal(r.headers.get('Cache-Control'),'no-store');
  assert.equal(r.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
  assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');
});
