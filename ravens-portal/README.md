# RAVENs WEB STUDIO unified tools portal (preview)

This is an isolated static hub at `ravens-portal/index.html`, **not** a replacement for the Firstmake root `index.html`.

## Included links
- FMFM Tools, FramePick, Firstmake, PhraseLane, NoteForge.
- Links preserve their existing origins; no tool code, accounts, payment handling, or stored user data is migrated.
- Basic website service price remains JPY 1,500 including tax, one-time; infrastructure recurring costs are separate.
- Contact via the studio Instagram. No store/demo phone numbers, private address, or individual identity.

## Security and release
- There is **no Google OAuth implementation**, no login button, no fake session.
- No Stripe secret or payment link is changed; no payment is collected on the hub.
- No deployment configuration is added to this branch; merging should not trigger an existing Firstmake Worker build from this subdirectory.
- Page is marked noindex until public review and deployment approval.
- Before release: verify each external destination and its ownership/availability, check accurate disclosures and legal pages, validate mobile/keyboard navigation, choose an independent Cloudflare Pages/Workers project, configure Google OAuth only after a securely verified callback and origin are known, and check production headers.
- Do not republish intentionally stopped websites or contact the 11 already approached stores.

## Local check
Open `ravens-portal/index.html` in a browser. It requires no JavaScript, CDN, API key, framework, database, or paid dependency.

## Integration scope
Phase 1 is a unified directory/navigation. Phase 2 (not yet implemented) may migrate tools into one hostname after examining source, dependencies, privacy, paths and regression tests.
