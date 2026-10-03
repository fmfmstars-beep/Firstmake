# Utility sites, first batch

Three separate browser utilities use Cloudflare Pages. Processing runs entirely in the browser. No API keys, external scripts, analytics, data uploads, or advertising scripts are included. The AdSense publisher tag and ads.txt establish site ownership; they do not show ads or demonstrate approval.

| App | Cloudflare project | Public address |
| --- | --- | --- |
| TidyCSV | tidy-csv-fmfm-stars | https://tidy-csv-fmfm-stars.pages.dev/ |
| JSONWorkbench | json-workbench-fmfm-stars | https://json-workbench-fmfm-stars.pages.dev/ |
| CaptionClean | caption-clean-fmfm-stars | https://caption-clean-fmfm-stars.pages.dev/ |

Run from the repository root:

```sh
node --test apps/tidy-csv/test/*.test.mjs apps/json-workbench/test/*.test.mjs apps/caption-clean/test/*.test.mjs
node apps/utility-sites/build.mjs
node --test apps/utility-sites/test/*.test.mjs
```

The dependency-free build embeds public assets in `dist/_worker.js`, creates ownership/robots/sitemap routes, validates internal HTML links, and applies a restrictive Content Security Policy. A Pages Direct Upload deployment uses an empty asset manifest and this Worker module. Build output is generated and should not be committed.

To use Wrangler, authenticate through its normal secure flow, then run `npx wrangler pages deploy apps/tidy-csv/dist --project-name tidy-csv-fmfm-stars` (use the matching directory and project for each tool). Production and preview compatibility date is 2026-10-01. Do not change the Firstmake main branch or the PhraseLane service when deploying these projects.

Before serving ads, finish provider approval, update privacy disclosures and consent handling for the actual advertising stack, and narrowly adjust CSP to the required provider hosts. Current privacy pages describe the deployed version without ad tracking. Traffic and revenue are not guaranteed by publishing or requesting review.
