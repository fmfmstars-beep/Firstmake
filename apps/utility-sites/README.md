# Browser utility sites

Separate browser utilities use Cloudflare Pages. Processing runs entirely in the browser. No API keys, external scripts, analytics, data uploads, or advertising scripts are included. The AdSense publisher tag and ads.txt establish site ownership; they do not show ads or demonstrate approval.

| App | Cloudflare project | Public address |
| --- | --- | --- |
| TidyCSV | tidy-csv-fmfm-stars | https://tidy-csv-fmfm-stars.pages.dev/ |
| JSONWorkbench | json-workbench-fmfm-stars | https://json-workbench-fmfm-stars.pages.dev/ |
| CaptionClean | caption-clean-fmfm-stars | https://caption-clean-fmfm-stars.pages.dev/ |
| ImageFit Desk | image-fit-fmfm-stars | https://image-fit-fmfm-stars.pages.dev/ |
| MeetAcross | meet-across-fmfm-stars | https://meet-across-fmfm-stars.pages.dev/ |
| PocketMath | pocketmath-fmfm-stars | https://pocketmath-fmfm-stars.pages.dev/ |

Run from the repository root:

```sh
node --test apps/tidy-csv/test/*.test.mjs apps/json-workbench/test/*.test.mjs apps/caption-clean/test/*.test.mjs apps/image-fit/test/*.test.mjs apps/meet-across/test/*.test.mjs apps/pocketmath/test/*.test.mjs
node apps/utility-sites/build.mjs
node --test apps/utility-sites/test/*.test.mjs
```

The dependency-free build embeds public assets in `dist/_worker.js`, creates ownership/robots/sitemap routes, validates internal HTML links, and applies a restrictive Content Security Policy. ImageFit Desk additionally allows local blob image previews; the other sites retain self-only image loading. A Pages Direct Upload deployment uses an empty asset manifest and this Worker module. Build output is generated and should not be committed.

The second batch targets specific repeated tasks: fitting an image to an upload budget and checking date-specific work-hour overlaps. This is an opportunity hypothesis, not a claim of measured keyword demand or expected traffic. Each site includes separate practical guides rather than pages differing only by a target number or city name. MeetAcross depends on the browser's time-zone data and does not check holidays or participant calendars. ImageFit reports measured output size and does not promise every target can be achieved.

Research checked on 2026-10-03: [Google's images course](https://web.dev/learn/images) describes image size/performance use cases; [Google's useful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) supports original, useful pages; [IANA](https://www.iana.org/time-zones) explains rule updates through operating systems and software; [GOV.UK](https://www.gov.uk/when-do-the-clocks-change) and [NIST](https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst) confirm the different UK/US autumn 2026 transition dates. Competitor pages already offer compression targets and meeting planning, so those features alone are not exclusive differentiation. No keyword volume, visits, ad revenue, or approval probability was measured. Candidate search intents are “image file size vs dimensions”, “compress image under an upload limit”, and “London New York meeting daylight saving”.

To use Wrangler, authenticate through its normal secure flow, then run `npx wrangler pages deploy apps/tidy-csv/dist --project-name tidy-csv-fmfm-stars` (use the matching directory and project for each tool). Production and preview compatibility date is 2026-10-01. Do not change the Firstmake main branch or the PhraseLane service when deploying these projects.

Before serving ads, finish provider approval, update privacy disclosures and consent handling for the actual advertising stack, and narrowly adjust CSP to the required provider hosts. Current privacy pages describe the deployed version without ad tracking. Traffic and revenue are not guaranteed by publishing or requesting review.

PocketMath was recovered from its public Direct Upload deployment after AdSense reported a content-related issue. The repair replaces the advertising loader with ownership metadata, fixes a reproduced decimal rounding error, explains remainder allocation, and adds useful calculation guides. The exact review cause is unconfirmed; these changes do not establish policy approval. The original `/about` and `/privacy` paths redirect to their maintained HTML pages.
