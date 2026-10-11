# FMFM Tools directory

Production: https://fmfm-tools.fmfm-stars.workers.dev/

`worker.mjs` was recovered from the deployed Worker on 2026-10-11. It contains the existing static assets and security/routing handler. This release expands the directory to ten tools, four guide websites and eight additional public workspaces and Japan guides, with a clearly identified RAVENs Web Studio consultation link. It does not collect payments or add tracking.

Validate with `node --check apps/fmfm-tools/worker.mjs`. Deploy only this project with `npx wrangler deploy --config apps/fmfm-tools/wrangler.jsonc`, from the repository root. Firstmake uses the root config and is a separate Worker.

This session used the connected Cloudflare API because no Cloudflare CLI credentials were configured. Preserve existing guides, policies, security headers and route behaviour when editing the embedded asset map.
