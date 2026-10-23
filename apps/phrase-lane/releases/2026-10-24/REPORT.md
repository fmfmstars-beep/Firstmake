# PhraseLane release and organic growth — 2026-10-24 JST

Production: https://phrase-lane.fmfm-stars.workers.dev/
Deployment: 4f7f3e6032aa4851b3519830a548c99e

## Released
- Downloaded and preserved the actual production Worker. The newer checkpoint branch is a different, unready Google-auth/MVP implementation; it was not promoted.
- Production snapshot, assets, repeatable patch/build script and released module are in this directory. `node build-release.mjs` reproduces worker.mjs from the preserved snapshot.
- Added instructions before translator, made translation output editable, added dark green navigation with visible focus and mobile wrapping rules, versioned CSS/JS URLs to avoid stale browser caches.
- Corrected canonical and Open Graph URLs from the old pages.dev host to the actual workers.dev host.
- Fixed robots.txt literal newline escapes; sitemap includes the new article.
- Published /blog/follow-up-japanese-client with three original bilingual drafts, practical review guidance and links to the translator. Linked it from home and journal.
- Replaced only Worker content through the content API. No D1 migration, secret change, budget increase, paid advertising, billing launch or seller-data publication.

## Verified
- Syntax check passed.
- Local Worker checks: 36 home links/assets returned 200; guide order, editable result, canonical host, robots newlines, new sitemap entry, 404, config/account response parity with original passed.
- Production browser: instructions before workspace, example loading, actual EN-to-JA request (1.55s round trip, one sample only), result editing, Copy success message, TXT download success message.
- PC screenshot inspected. CSS supports small widths, but no mobile viewport/device test was available; mobile rendering remains unverified.
- No hosted Google authentication, real voice recording, billing or Windows-client test performed.

## Organic marketing performed
Budget: zero. Audience: English-speaking freelancers working with Japanese clients.
Published search entry: polite follow-up examples, linking to existing deadline/brief/rescheduling guides and translator. Positioning and factual beta limits remain consistent. No invented users, revenue or testimonials.

Next measurable conversion: article visit → translator use → return visit. No visitor, conversion or revenue counts have been retrieved. New analytics instrumentation was not added. Existing account-wide request counts would include bots and tests and cannot prove user acquisition.

Ready-to-use campaign destinations (not posted externally):
- Article: https://phrase-lane.fmfm-stars.workers.dev/blog/follow-up-japanese-client?utm_source=linkedin&utm_medium=organic_social&utm_campaign=client_followup_20261024
- Demo: https://phrase-lane.fmfm-stars.workers.dev/?example=deadline&utm_source=linkedin&utm_medium=organic_social&utm_campaign=client_followup_20261024
Check the existing example ID before using the demo query; the article URL does not depend on examples. UTM parameters alone do not implement attribution reporting.

Suggested post draft: Working with a Japanese client and waiting for feedback? We published three English–Japanese follow-up drafts: confirm file delivery, request feedback and agree on the next step. Adapt names and details, then review the wording before sending. PhraseLane's short-text translator is currently in free beta; Pro sales are closed.

No social post or outreach message was sent. Google Search Console ownership/sitemap submission and actual search index inclusion remain unverified. No search ranking or traffic increase is promised.

## Remaining execution-plan work
The deployed legacy free beta still uses 500 characters/request and 10 requests/network/UTC day. It does NOT implement the attached plan's account-specific 5,000-character/50-attempt monthly text allowance, audio allowances, Google sessions, paid-period quota ledger, or full idempotency requirements. The public page accurately describes current behavior rather than advertising future allowances as available.

Keep Pro at planned USD9/month, sales OFF. Production settings observed BILLING_ENABLED=false, BILLING_TESTED=false, LEGAL_READY=false. The dedicated sandbox and its actual Checkout/webhook/renewal/cancellation/refund sequence, Google OIDC, AI budget review, server quota migration and Windows connection verification remain separate unfinished work. Preserve the newer implementation in the parent branch for that work; do not replace it with this legacy module.
