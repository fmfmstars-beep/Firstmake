# PhraseLane

International text translation, browser voice input and speech playback, local subtitle drafts, and six original English blog articles.

Live: https://phrase-lane.fmfm-stars.workers.dev
Blog: https://phrase-lane.fmfm-stars.workers.dev/blog

## Current status — 2026-10-05, superseding the archived notes below

The production legacy billing backend hardening is now deployed as Worker version `9dd2a59547f14a95baebd3f07dde0d05`. The exact existing live assets were preserved. Pro entitlement now requires a paid invoice together with an active matching subscription; the backend also rotates expired Checkout sessions and uses subscription/customer compare-and-set updates. **New paid sales remain OFF.**

The legacy backend suite passes **44 tests**. These use controlled responses and do not demonstrate a real Stripe payment end-to-end. Actual Checkout → paid invoice → webhook entitlement → portal cancellation and failure/expiry verification remains outstanding.

The dedicated Stripe sandbox webhook `we_1UN2skEZGF3krm5O111p58bX` now includes `charge.refunded` while preserving its 11 existing events. An actual refund-to-entitlement end-to-end test is still pending.

The combined audio/text MVP is maintained separately on `feat/phraselane-integrated-mvp`. It replaces this branch's earlier draft text-only/calendar-month Pro proposal. The integrated Pro plan is USD 9/month with 7,200 audio seconds and 600 audio attempts, plus 50,000 input text characters and 500 text attempts, per **paid subscription billing period**. Free limits use UTC calendar months. The integrated build is deployed only to the separate sandbox as version `21735127a30f41d089b9178e1ec20e13`; its 38 MVP tests and 3 Pages proxy tests passed. Do not deploy this branch's older pricing/account asset snapshot over the combined MVP.

Stripe's public support address and telephone are now configured as `SELLER_ADDRESS` and `SELLER_PHONE` in both Workers. The seller's formal legal name (`SELLER_NAME`) is still missing, so the full seller disclosure is incomplete. Stripe API keys, Google OAuth setup, real payment verification and live billing setup still require completion. The production D1 extension migration was rejected with authentication error `10000`; a subsequent read confirmed the old schema remains unchanged. Do not turn on `BILLING_TESTED`, `LEGAL_READY` or `BILLING_ENABLED` to bypass these gaps.

A pricing-page screenshot has been captured and is available. The integrated branch's `LAUNCH.md` records the current launch tasks and configuration requirements. The historical sections below document earlier work and must not be used as the current deployment or seller-configuration status.

## Archived development and launch notes

The following notes are retained for history. Current deployment, test-count, seller-configuration and Pro-plan status is given above.

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

## Archived: initial 2026-10-05 paid-tool preparation update

This initial asset-only release record is superseded by the current status above. Its text-only plan, 36-test count, seller-address/telephone gaps and statement that production backend changes were not deployed are historical, not current.

The production release is limited to the new standalone subtitle HTML, JavaScript and CSS, plus the homepage subtitle description. The existing production backend and all production bindings were preserved. The canonical URL is the Worker above.

The billing improvements, account/pricing changes and proposed text-only USD 9/month plan below exist on the draft branch `feat/phraselane-paid-tool-launch`; they are not live. Before broader deployment, reconcile this draft with the concurrent audio/MVP work, including its latest client and mobile corrections, which have not been merged locally. The local asset snapshot must not be treated as the latest combined production source.

A concurrent Cloudflare task was detected during sandbox validation. After our temporary testing, its sandbox Worker version `9a2551b1-7ab0-4602-b3f8-efd1930c53a4` was restored. Our draft backend is not the retained sandbox deployment.

- Subtitle maker exports SRT, WebVTT and TXT in the browser, validates 1–30 whole seconds per cue and up to 200 lines/20,000 characters, and clears stale output after edits.
- Draft pricing and account pages propose a **text-only USD 9/month plan**: 50,000 input characters per UTC calendar month, 1,000 per request and 100 requests per day. This draft does not implement the voice-minute packages or billing-period quotas from the longer-term specification; reconcile them with the concurrent audio/MVP implementation. Global beta capacity still applies, and failed AI calls can count toward allowances. These facts are displayed in the draft before purchase; the proposal must be reconciled with the concurrent plan before deployment.
- In the draft backend, active subscriptions with a valid matching Price item period alone grant Pro. Customer ownership, Checkout environment, duplicate subscriptions, pending sessions and stale subscription events are checked. Subscription/Customer compare-and-set prevents concurrent replacement from silently overwriting another subscription.
- Draft Customer creation and Checkout use stable idempotency keys. An existing open Checkout is reused. These controls reduce duplicate subscriptions; actual asynchronous payment and expiry behavior still needs Stripe sandbox verification.
- Draft `GET /api/account` exposes a UTC calendar-month quota period and a billing-management availability flag without exposing the customer ID.
- Draft translation handling stops before AI calls or quota consumption when `AI_ENABLED=false`; an unset flag preserves the previous behavior. This backend change was not included in the production asset release.

### Remaining billing configuration

Production has **no Stripe API key, price or webhook secret configured**. `BILLING_ENABLED`, `BILLING_TESTED` and `LEGAL_READY` remain false. Seller name, address and telephone are unset. Do not turn these flags on just to make the purchase button clickable.

The separate Stripe sandbox is `acct_1UEAGpEZGF3krm5O`; its Worker is `phrase-lane-billing-sandbox` and its D1 is `319ebbf0-e3b2-4418-aef2-b5c1a03b9b76`. Its existing `price_1UN2GEEZGF3krm5OMWmVf7Ja` was confirmed active at USD 9/month. A portal configuration `bpc_1UN8UsEZGF3krm5OXXqGVfes` now provides invoice history, payment-method updates and cancellation at period end. Webhook `we_1UN2skEZGF3krm5O111p58bX` includes subscription paused/resumed and invoice finalization failure in addition to the existing events.

The sandbox still needs `STRIPE_SECRET_KEY`, stored as a **Cloudflare secret**, from that same Stripe sandbox. Prefer a restricted key permitting Customer creation, Subscription reading, Checkout Session reading/creation, and Billing Portal Session creation. Never paste that key into chat, source, reports, or a plain-text variable. Complete a real test Checkout, webhook-granted access without visiting the success page, duplicate/reordered notifications, renewal failure, Portal cancellation and expiry before enabling live sales. Test accounts and live accounts must keep separate keys, prices, webhooks and D1 data.

Local validation: 36 Node tests passed using SQLite and mocked Stripe responses. This is not a real payment test. The browser verified SRT/VTT/TXT output and invalid-input reset, plus draft pricing availability and the account link. Four pages were rendered in 375px and 1280px iframes (actual content widths 360px and 1265px after scrollbar); no horizontal overflow. This is not an iOS/Android device test. A download was requested but the browser automation did not receive a download event, so saved-file bytes remain unverified.
