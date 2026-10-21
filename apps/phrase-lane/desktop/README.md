# PhraseLane Windows development client

Status: source implemented; Windows compilation, signing, real-device UI and real account pairing are NOT verified. Do not distribute as a production EXE.

## What is implemented
- Local Tauri UI, English/Japanese text input, result copy and clearing.
- Fixed staging HTTPS destination. No arbitrary URL proxy or shell command parameters.
- System-browser approval, SHA-256 proof-bound device exchange, 15-minute translation-only credential held in Rust memory (not localStorage or disk).
- No audio capture yet in the native client. The existing Web workspace provides audio when configured.
- Payments, account deletion and owner records stay on the website. Native tokens cannot call them.

## Build on Windows 11 x64
1. Install the official Tauri 2 Windows prerequisites (Rust MSVC, Visual Studio C++ build tools, WebView2).
2. Install the Tauri 2 CLI with `cargo install tauri-cli --version '^2' --locked`.
3. From this directory run `cargo tauri build`.
4. Retain and review the generated `src-tauri/Cargo.lock`; pin the reviewed dependency resolution before release.
5. Review/sign the installer using the operator's code-signing identity and verify installation, microphone policy, login, token expiry, upgrade and uninstall on a real device.

No code-signing identity was available in this task. Do not disable OS security prompts or call an unsigned build a signed release.

## Server prerequisites
Apply `../migrations/0003_desktop_pairing.sql` to isolated staging first, then enable `DESKTOP_ENABLED=true` only after approval-flow tests pass. Google login and recently verified Google authentication must work. Existing AI readiness, server budget and usage limits still apply.

The 2026-10-14 inspected staging environment has no Google OAuth credentials, no Stripe API key, AI_ENABLED=false and zero AI budgets. This app must show those limits, not bypass them. Migration was NOT applied remotely and desktop connections remain disabled.

## Release differences from the complete specification
This is an incremental implementation preserving the existing backend, its 1,000-character / 30-second Web limits and existing USD9 plan. It does not change plans to the new proposed Plus price or claim streaming voice translation. Native sessions deliberately expire after 15 minutes without persistent refresh tokens. The complete target specification requires further work.

## Security review
The code shown in the desktop app must be typed into the canonical browser page. Never approve unsolicited device codes. Hash-only credentials are stored server-side; parent-browser logout invalidates native access. No cloud AI or Stripe key enters the app. Failed token persistence consumes the pairing code and requires restarting rather than issuing a duplicate credential.

References: https://v2.tauri.app/start/prerequisites/ · https://v2.tauri.app/security/
