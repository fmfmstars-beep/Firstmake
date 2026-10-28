# FramePick

Independent AI video-tool comparison and 3-question finder.

## Isolation
This project lives under `apps/framepick/` and deploys to its own Cloudflare Worker named `framepick`. It does not share the production Worker name or configuration of Firstmake, FMFM Tools, PhraseLane, or the existing Pages projects.

## MVP
- 3-question finder
- tool comparison
- simple cost-per-clip calculator
- methodology and privacy pages
- robots.txt and sitemap.xml
- no login, payments, analytics, or ad scripts yet

## Data sources
Current comparison facts were checked against official Runway, Pika, Luma, and Adobe pages on 2026-10-28. Re-check before changing pricing claims.

## Deploy
From the repository root:
```
npx wrangler deploy --config apps/framepick/wrangler.jsonc
```

Expected Worker: `framepick`
Expected URL: `https://framepick.fmfm-stars.workers.dev/`
