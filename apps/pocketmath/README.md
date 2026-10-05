# PocketMath public-site repair

PocketMath retains its tip calculator, equal bill splitter and discount calculator, with exact decimal arithmetic and explanations tied to the actual inputs. The existing production site uses `pocketmath-fmfm-stars.pages.dev` and was a Cloudflare Pages Direct Upload project.

## Concrete changes

- Decimal inputs are parsed into integer cents and hundredths of a percent using `BigInt`. Percentage adjustments use round-half-up before totals or subsequent discount stages. The prior implementation returned a 0.14 tip for `0.29 × 50%` because of binary floating-point rounding. The repaired result is a 0.15 tip and 0.44 total.
- Equal bill splitting allocates the remainder one cent per person, so the stated payment groups sum exactly to the bill plus shared extras. The application retains only two allocation groups even for large party sizes.
- Discounts support a second sequential percentage, show each rounded stage and report the effective reduction. A second discount of zero preserves the original one-discount workflow.
- Input-specific steps, original guides on rounding, bill splitting and sequential discounts, and current About/Privacy/Terms/Contact pages accompany the tools.
- CSS and JavaScript are local external files. Output uses `textContent`; calculator inputs are neither transmitted nor persisted. No advertising or analytics scripts run. The publisher ownership meta tag is present; the shared packer supplies `ads.txt` for review.

## Review context and limits

The AdSense dashboard reported “Google-served ads on screens without publisher-content.” The recovered production homepage already had calculators and static worked examples; About, Privacy and a sampled true 404 contained no ad script. The exact reason for the review outcome is therefore not established. These changes improve verified correctness and practical publisher content. They do not guarantee AdSense approval or revenue, and no minimum word-count rule is asserted.

The tools support non-negative decimal amounts with at most two fractional digits, each no more than 1,000,000,000.00. Tip rates are 0–1,000%; discount rates are 0–100%, with up to two decimal places. Groups contain 1–10,000 people. Amounts use a 0.01 smallest unit; currency conversion, different minor-unit conventions, individual-item splits, taxes and fees not entered by the user are outside scope. Retailers may use different discount ordering or rounding.

## Verification

From the repository root:

```sh
node --test apps/pocketmath/test/*.test.mjs
```

Tests cover the known half-cent regression, invalid-input and range rejection, exact large-value arithmetic, allocation sum/count invariants, extras included once, sequential discounts, stage rounding, zero and 100% cases. The shared static-site packer and deployed browser verification are owned by the deployment workflow.

## Routes and deployment integration

Canonical origin: `https://pocketmath-fmfm-stars.pages.dev`.

Home is `/`. All other public canonical pages use `.html`: `/guide.html`, `/bill-split.html`, `/discounts.html`, `/about.html`, `/privacy.html`, `/terms.html`, `/contact.html`.

Preserve the previous `/about` and `/privacy` URLs as redirects to their `.html` equivalents. The original contact URL was `/about#contact`; `about.html` retains the contact anchor so browser fragment propagation continues to work. Keep the recovered production HTML in `apps/pocketmath-repair/original` as evidence of the previous version; do not ship it as public assets.

The shared packer in `apps/utility-sites/build.mjs` manages deployment output, site metadata, `robots.txt`, sitemap, headers and a noindex 404. Do not add an ad-serving script until review status, disclosure and consent configuration have been checked.
