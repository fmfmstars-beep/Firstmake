# ImageFit Desk

An English browser-only image sizing tool at `https://image-fit-fmfm-stars.pages.dev/`.

- Supports one static JPEG, PNG or WebP input; rejects GIF/SVG/HEIC and animated PNG/WebP.
- Parses headers before decoding. Limits: 10 MiB encoded input, 8192 pixels per axis, 16,000,000 pixels total. Checks decoded dimensions too, including EXIF orientation swaps.
- Maximum width/height preserve aspect ratio with integer rounding and never upscale.
- JPEG/WebP search at fixed dimensions uses up to nine canvas exports, checks actual MIME and byte count, and reports unmet targets honestly. PNG performs one lossless export. JPEG fills transparency with white.
- Target KB means decimal 1000 bytes. No automatic extra resizing to force a target.
- Source/output object URLs are revoked when replaced; asynchronous work is invalidated on new files/settings. No network upload, browser storage, external libraries or ad scripts.
- The persistent result link has an actual blob URL and download filename.
- Original guides, format comparison and About/Contact/Privacy/Terms are included. Publisher meta is for ownership verification only.

Run helpers: `node --test apps/image-fit/test/core.test.mjs` from repository root.

Browser smoke test: select **Try a generated sample** (1280 × 800 PNG), set target **100 KB**, output **JPEG**, maximum width **800** and maximum height **800**, then **Optimize image**. Check result dimensions **800 × 500**, measured budget status, both previews, and the persistent **Download JPEG** link. Change target to **1 KB** and ensure the result truthfully says target not met; switch to PNG and confirm one lossless trial. Clear removes image and download URLs.

The root utility-site packer supplies Worker hosting, headers, ads.txt, robots, sitemap and the not-found route. No payment or subscription feature exists here.
