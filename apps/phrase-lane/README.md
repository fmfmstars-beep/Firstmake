# PhraseLane

International text translation, browser voice input and speech playback, local subtitle drafts, and six original English blog articles.

Live: https://phrase-lane.fmfm-stars.workers.dev
Blog: https://phrase-lane.fmfm-stars.workers.dev/blog

## Develop

Node 24 recommended (tests use node:sqlite). No npm dependencies.

```
npm run build
npm test
npm run dev
```

Local dev previews static pages; API needs Cloudflare AI and D1 bindings. Use Cloudflare Wrangler for a bound development environment. Edit public files directly, or edit content.py and regenerate with Python 3. Build embeds the assets in one module.

## Architecture and controls

Cloudflare Worker + Workers AI m2m100 + D1. Source texts and translations are not persisted in D1. Voice recognition may send audio to the browser provider; explicit consent is required. HTTPS, CSP, secure HttpOnly cookies, CSRF origin checks, hashed recovery keys, hashed network quota identifiers, parameterized SQL, request size limits, atomic usage quotas, signed Stripe webhooks, and server-side entitlements are implemented. No software can guarantee immunity from attacks.

Translation: 500 characters/request, 10/day/network, 6/minute, global beta fuse 200/day. Global limits also apply to future paid accounts; capacity must be assessed before selling. Latency is measured, not guaranteed. No streaming simultaneous interpretation.

## Deployment

Worker: phrase-lane. Apply schema.sql to the D1 binding in wrangler.jsonc. Generate a random 32-byte QUOTA_SALT and store it as a Worker secret; never commit it. Build, upload dist/worker.mjs, enable workers.dev, and configure daily cron `17 0 * * *` for expired counters/sessions. Logs are disabled. No automatic GitHub deployment is configured; publishing is explicit.

## Billing launch checklist — currently OFF

1. Complete Stripe account verification and the seller-owned payout account through Stripe's dashboard. Do not send account keys or banking details through chat.
2. Provide truthful legal seller name, business address, phone and support contact. Publish required disclosures and review tax/refund/consumer rules for target markets.
3. Create a recurring USD 9/month price; store STRIPE_PRICE_ID as a variable and STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET as secrets. Confirm the actual Stripe price matches the displayed plan.
4. Set BILLING_MODE to `live` for the production Worker or `test` for a separate sandbox Worker with a separate D1 database and sandbox secrets. Configure webhook `/api/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, and `invoice.payment_action_required`. Use the pinned `2026-08-26.dahlia` webhook API version. Enable the billing portal with cancellation. Checkout, portal, entitlement ownership, signature verification, renewal failure, cancellation and refunds must be tested with Stripe test mode first.
5. Update the pricing/legal pages from beta/not-on-sale wording, assess global capacity and budget, then set BILLING_TESTED, LEGAL_READY and BILLING_ENABLED to true. These flags alone do not prove legal compliance or successful live billing.
6. Owner-only buyer/payment/revenue records are in the Stripe dashboard. No customer data is publicly listed and no custom owner revenue dashboard is implemented.

Billing infrastructure exists but no live payment was processed. Account recovery uses a private recovery key. Losing it can lose access; add a verified recovery mechanism before wider paid rollout. Do not request that users email recovery keys.

## Revenue target

JPY 1,000,000 is a goal, not earned revenue or a guarantee. As an illustrative gross MONTHLY target, at USD 9/month and an assumed JPY 150/USD, 741 paying subscribers yield JPY 1,000,350/month before processing fees, taxes, refunds and infrastructure costs. The exchange rate is a scenario, not a quoted current rate. For a cumulative target, the timeframe and churn change the calculation.

First validate with 10 international freelancers/support operators. Measure repeat usage and translation usefulness; then seek the first 5 voluntary paying users after billing readiness. Publish helpful original articles targeting client-reply translation and subtitle drafts. No outreach, ads, fabricated testimonials or paid promotion were sent or bought.

## Operations

Use Cloudflare's usage/billing dashboard to monitor account-wide AI and D1 usage. The application's 200-call cap is not a hard currency spending cap across other account resources. Lower it to 0 to pause new cross-language translations. Keep browser/provider privacy notices current. Process verified access/deletion requests via the contact channel. Regularly review dependency-free source, platform updates, Stripe webhook failures, quotas and abuse. A custom domain has not been purchased.

## Payment webhook deployment

Before deploying this branch, apply `migrations/0001_stripe_events.sql` to the existing D1 database (the operation is idempotent):

```sh
npx wrangler d1 execute phrase-lane-production --remote --file=migrations/0001_stripe_events.sql
npm run build
npm test
npx wrangler deploy
```

The production configuration sets BILLING_MODE=live but leaves billing disabled. Do not reuse the production database for sandbox testing. Webhooks retrieve the current subscription, validate its mode, owner and configured price, and commit the account update and completed event ID in one D1 transaction. An invoice arriving before checkout/subscription events resolves its owner from Stripe subscription metadata. A missing local account, Stripe error or database write failure leaves the event retryable. Non-subscription invoices are ignored.

The Node suite uses mocked Stripe responses; it does not prove real sandbox or live checkout. Before enabling billing, test the actual separate sandbox Worker: create/restore an account, start Checkout, complete a test payment, verify webhook-granted Pro without relying on the success page, manage/cancel through the portal, simulate renewal failure, resend an event and confirm duplicate handling. Check USD 9/month price, seller disclosures and global translation capacity. Keep BILLING_TESTED=false until that flow passes, and BILLING_ENABLED=false until all launch conditions are met.
