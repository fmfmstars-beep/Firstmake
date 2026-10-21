# 2026-10-14 — Web app and Windows connection increment

Base: fix/phraselane-billing-verification-20261011. Existing source and public production are preserved.

## Added
- Installable Web-app manifest, install entry point and generic offline fallback; no sensitive response caching.
- Focused cream/green translator layout preserving existing translation, fixed samples and voice controls.
- Native desktop client source (Tauri 2, Rust) and a proof-bound 15-minute translation-only connection protocol.
- Explicit browser device approval and server-side allowlist, expiry, parent-session revocation, hashed credentials and rate limiting.
- Additive desktop migration, disabled by default. No remote migration has been applied.
- Owner revenue date selection using JST invoice-paid dates. Refunds remain attributed to their paid invoices; balances/MRR remain current, not historical.
- Build-before-test wiring and a private static review generator.

## Verified this turn
Node integration/unit tests and Worker/native-JavaScript syntax checks. Real browser/device testing was unavailable under the current managed preview policy (control-browser skill unavailable). Read the test output in the handoff for the final count.

## Current blockers observed from staging metadata
Google OAuth credentials and STRIPE_SECRET_KEY are absent; AI is disabled and both AI budgets are zero. Billing/legal verification flags remain false. Only the operator's existing service configuration paths should be used to provide credentials; never paste secrets into chat or commit them.

## Still not complete
Windows EXE compilation/signing/device tests (no Rust or Windows build environment available in this run), native audio UI, production model quality/latency benchmarking, actual Google login and device pairing, actual Stripe sandbox purchase/refund/renewal, final geographic/legal launch checks. The reviewed website is sample-only, not a working cloud-AI service.

## Compatibility choices
Existing API paths, 1,000-character and 30-second Web limits, USD9 plan and global budget/launch gates are unchanged. The new complete specification's 4,000-character, 60-second, Plus pricing and streaming targets are future migration work, not implemented features. Native preview uses short-lived in-memory credentials, not persistent refresh tokens.

## Next safe step
Configure Google OAuth through Worker Secrets, then verify a genuine browser login. Apply the additive desktop migration to isolated staging and enable DESKTOP_ENABLED only for testing. Supply Stripe's restricted test key through Secrets and perform real test-mode checkout. Keep all production/billing launch switches off until those checks pass.
