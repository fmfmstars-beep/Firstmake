# PhraseLane billing sandbox

This separate Worker and D1 database are for Stripe test-mode verification only. No production DB or Stripe live-mode payment is used.

- Worker: `phrase-lane-billing-sandbox`
- Origin: https://phrase-lane-billing-sandbox.fmfm-stars.workers.dev
- D1: `phrase-lane-billing-sandbox` (`319ebbf0-e3b2-4418-aef2-b5c1a03b9b76`)
- Stripe sandbox account: `acct_1UEAGpEZGF3krm5O`
- Test price: `price_1UN2GEEZGF3krm5OMWmVf7Ja` (USD 9/month)
- Webhook: `we_1UN2skEZGF3krm5O111p58bX`, `/api/webhook`, API `2026-08-26.dahlia`

Current bindings: DB, QUOTA_SALT and STRIPE_WEBHOOK_SECRET are configured; secrets are omitted from source. BILLING_MODE=test; DAILY_TRANSLATION_CAP=0; BILLING_ENABLED=false, LEGAL_READY=false, BILLING_TESTED=false. No AI binding exists, preventing translation spend.

Remaining dependency: the owner must securely configure a Stripe sandbox restricted API key as STRIPE_SECRET_KEY through Cloudflare's secrets UI or CLI. Do not place it in chat, logs or Git. Use a test key from the stated sandbox and give only the API permissions needed for checkout sessions, customers, subscriptions and billing portal sessions. Configure a test-only billing portal and non-binding sandbox seller details. Enable gates only in this isolated environment under the explicit test workflow; production remains gated. Test checkout completion, signed webhook delivery, entitlement in the sandbox DB, duplicate/out-of-order events, payment failure, portal cancellation and entitlement removal. Only after actual results are recorded may production readiness be considered.

Verified deployed GET /api/config returns billing:false and an unsigned webhook returns HTTP 400 Invalid webhook signature. The 18 upstream tests use mocks and are not evidence of real Stripe checkout or cancellation. Actual Checkout -> webhook -> entitlement -> cancel has not run because STRIPE_SECRET_KEY is absent.
