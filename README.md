# Brightline

Brightline scans a website for likely manipulative design ("dark patterns") and maps each finding to the EU provision it may fall under.

It reports a **possible issue under a named provision**, with evidence: the element, its text, a cropped screenshot, measurements and a confidence level. It never says that something is illegal. A person who knows the facts and the national law has to decide.

Not legal advice. Using Brightline does not make a website compliant with anything.

## Why it exists

EU consumer law already bans many manipulative designs, from fake countdowns to pre-ticked paid extras and late fees. Existing open tools are mostly browser extensions or cookie-banner scanners, and they do not say which rule a pattern may break. Brightline crawls a site, can walk through a checkout, and links every finding to the official text on EUR-Lex.

The law it maps to, all read from the official texts on EUR-Lex:

- [Unfair Commercial Practices Directive 2005/29/EC](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02005L0029-20260927) (UCPD), consolidated text of 27 September 2026, including the Annex I blacklist as amended by Directives (EU) 2019/2161 and 2024/825.
- [Consumer Rights Directive 2011/83/EU](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02011L0083-20260927) (CRD), consolidated text of 27 September 2026.
- [Price Indication Directive 98/6/EC](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:01998L0006-20220528) (PID), Article 6a as inserted by Directive (EU) 2019/2161.
- [Digital Services Act, Regulation (EU) 2022/2065](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065) (DSA), Article 25, applicable from 17 February 2024.
- [General Data Protection Regulation (EU) 2016/679](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) (GDPR), Articles 4(11) and 7, only for consent-related patterns.

## Quick start

Requires Node.js 22 or later.

```sh
npm install @afkzona/brightline
npx playwright-core install chromium-headless-shell
npx brightline scan https://shop.example --max-pages 5
```

This writes `brightline-report/report.json`, `brightline-report/report.html` and `brightline-report/screenshots/`. Open the HTML file in a browser.

Brightline uses Playwright's bundled Chromium only. It never starts a Chrome browser installed on your machine.

## How it maps to the law

| Detector | What it looks for | Provision (possible issue under) | Confidence |
| --- | --- | --- | --- |
| `countdown-reset` | A countdown that shows more time after a reload, or in a new browser session, than a fixed deadline would. The page is loaded, read twice to confirm the timer ticks, reloaded in the same context, and loaded again in a fresh context. | [UCPD Annex I point 7](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02005L0029-20260927#anx_I) (falsely stating that a product or terms are available only for a very limited time); [UCPD Art. 6(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02005L0029-20260927#art_6) | high if it restarts on reload; low if only in a new session (genuine per-visitor timers, such as seat or cart holds, do that too) |
| `preselected-option` | Checkboxes, switches and radio buttons that are already selected for an extra paid item (insurance, protection plan, priority, donation, ...) or for consent (newsletter, marketing, partners). Words that also appear in neutral labels ("express", "premium", "protection", "tip") count only next to a price. Disabled "strictly necessary" toggles and neutral defaults ("remember me") are ignored. | Paid extras: [CRD Art. 22](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02011L0083-20260927#art_22). Consent: [GDPR Art. 4(11)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679#art_4) and [Art. 7](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679#art_7); recital 32 says pre-ticked boxes do not constitute consent | high with a price or a clear marketing cue (a radio button at most medium); medium on a keyword only; low for a contact request alone ("send me updates by SMS"), which may be a service message |
| `confirmshaming` | A decline option worded to shame or guilt ("No thanks, I prefer to pay full price"). Phrase lists are data; English is written by the maintainers, other languages are translations awaiting native review. A negative opener plus a guilt cue is a weaker heuristic. | [UCPD Art. 5(2)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02005L0029-20260927#art_5) and [Art. 8 and 9](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02005L0029-20260927#art_8); in a consent request also GDPR Art. 4(11); DSA Art. 25 for online platforms only | medium for a listed phrase, low for the heuristic |
| `asymmetric-choice` | In a dialog or banner, the decline option (including "necessary only" options such as "Allow necessary cookies only") is much weaker than accept: at least 3 times smaller, styled as a plain link while accept is a filled button, accept text at least 1.4 times larger, text contrast below 3:1 while accept is at least 2 points higher, or faded. Measured from computed styles and bounding boxes. Also a consent request with no way to refuse on the first layer. | Consent requests: GDPR Art. 4(11) and Art. 7 (DSA Art. 25 is not listed, because Art. 25(2) excludes practices covered by the GDPR). Other dialogs: UCPD Art. 5(2), with [DSA Art. 25(3)(a)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065#art_25) ("giving more prominence to certain choices") as a secondary reference | high with 3 or more signals in a consent request, medium with 2 (and the cap outside consent requests), low with 1; low for a missing refuse option |
| `claim-to-verify` | "Only 2 left", "12 people are viewing", "Sale ends today". A scanner cannot know if such claims are true, so every finding asks you to verify the claim. | Stock: UCPD Art. 6(1)(b) and [Annex I point 18](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02005L0029-20260927#anx_I). Activity: UCPD Art. 6(1). Time limits: Annex I point 7 | low |
| `price-reduction-prior-price` | A discount percentage with no reference price, or a struck-through price with no statement that it is the lowest price of the previous 30 days. A 30-day mention counts as such a statement only with a word such as "lowest" (so "30 days free returns" does not). Banners without an amount are ignored. | [PID Art. 6a](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:01998L0006-20220528#art_6a): any announcement of a price reduction must indicate the prior price, the lowest price in at least the 30 days before the reduction | medium for a bare percentage; low for a percentage next to a second amount not marked as the prior price, and for a bare strikethrough |
| `order-button-label` | Journey only. The final order button must say that ordering means paying. Brightline accepts the official wording in all 23 language versions that contain it (copied verbatim from EUR-Lex) and labels with a payment word ("pay", "buy", "purchase" and listed translations). Treating payment words as a "corresponding unambiguous formulation" is the maintainers' reading, not official wording. | [CRD Art. 8(2), second subparagraph](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02011L0083-20260927#art_8): labelled "only with the words 'order with obligation to pay' or a corresponding unambiguous formulation" | high for "Continue", "Submit", "Confirm" and similar; medium for "Place order" and other labels without a payment word |
| `hidden-costs` | Journey only. The displayed total grows between two checkpoints. | [CRD Art. 6(1)(e) and 6(6)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02011L0083-20260927#art_6), CRD Art. 8(2) first subparagraph, [UCPD Art. 7(4)(c)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02005L0029-20260927#art_7) | medium if the user only clicked forward; low if the user filled in or selected something in between, or if the extra amount was already shown on the earlier page |

Confidence describes how strongly the evidence points to the pattern. It is not a legal assessment.

### Scope notes

- **DSA Art. 25 applies only to providers of online platforms**: hosting services that store and disseminate information to the public at a user's request (Art. 3(i)). A normal web shop that sells its own products is usually not an online platform. Art. 25 does not apply to practices covered by the UCPD or the GDPR (Art. 25(2)), and micro and small enterprises are excluded unless designated as very large (Art. 19). Brightline lists it only as a secondary reference with this note.
- **UCPD, CRD and PID are directives.** They apply through national laws, which can differ in detail. PID Art. 6a(3) to (5) lets Member States set other rules for perishable goods, products on the market for less than 30 days and progressive reductions.
- **GDPR** is cited only where a pattern concerns consent. Consent for cookies is governed by national laws implementing ePrivacy Directive 2002/58/EC, Art. 5(3), which refers to the data protection definition of consent. Brightline does not check cookie behaviour.
- **CRD Art. 8(2)** wording: the Irish (GA) consolidated text shows this subparagraph in English only, so there is no Irish entry.

## Library

<!-- example: examples/scan-site.ts -->
```ts
import { scan, writeReports, type ScanOptions } from '@afkzona/brightline';

/** Scan a site and write report.json, report.html and screenshots to outDir. */
export async function scanSite(url: string, outDir: string, extra: Partial<ScanOptions> = {}) {
  const report = await scan({ url, maxPages: 5, outputDir: outDir, ...extra });
  await writeReports(report, outDir);
  for (const f of report.findings) {
    console.log(`[${f.confidence}] ${f.title}: ${f.pageUrl}`);
  }
  return report;
}
```

Main exports:

- `scan(options): Promise<ScanReport>`: crawl, countdown checks, optional journey, report.
- `writeReports(report, dir, { json, html })`: writes `report.json` and a self-contained `report.html`.
- `renderHtmlReport(report, { baseDir })`: the HTML as a string.
- `validateJourney(value)` and `parseJourney(text)`: strict journey validation.
- `PROVISIONS`, `DETECTORS`, `OFFICIAL_ORDER_BUTTON_LABELS`: the legal mapping as data.
- Pure detector functions (`detectPreselected`, `detectCountdownReset`, `assessOrderButtonLabel`, ...) for use on your own data.

The JSON report format is versioned (`schemaVersion`, currently `1.0.0`) and described by [`schema/report.schema.json`](schema/report.schema.json).

## Command line

```
brightline scan <url> [options]
brightline validate-journey <file>
brightline --help | --version
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--journey <file>` | none | Run a JSON user journey after the crawl |
| `--max-pages <n>` | 10 | Pages to crawl, 0 to 200. 0 runs the journey only |
| `--max-duration <s>` | 180 | Time budget in seconds, 5 to 1800 |
| `--out <dir>` | `brightline-report` | Output directory |
| `--format <f>` | `both` | `json`, `html` or `both` |
| `--detectors <list>` | all | Comma-separated detector ids |
| `--ignore-robots` | off | Do not read robots.txt |
| `--allow-address <ip>` | none | Allow one private IP address, for your own staging server. Repeatable. Cloud metadata addresses can never be allowed |
| `--fail-on <level>` | `none` | Exit with code 1 if a finding is at least `high`, `medium` or `low` |
| `--no-sandbox` | off | Run Chromium without its OS sandbox. Only inside a container. Also set by the environment variable `BRIGHTLINE_NO_SANDBOX=1`. If the sandbox cannot start, Brightline stops with an explanation instead of turning it off |
| `--quiet` | off | Print only the summary line |

Exit codes: 0 done, 1 findings at or above `--fail-on`, 2 usage or runtime error.

## Journeys

A journey is a JSON file that walks through a flow such as a checkout. It is data, never code: Brightline does not evaluate scripts from journeys. Steps:

| Step | Fields | Does |
| --- | --- | --- |
| `goto` | `url` | Navigate |
| `click` | `selector` | Click the first match |
| `fill` | `selector`, `value` | Type into a field |
| `select` | `selector`, `value` | Choose an option |
| `check`, `uncheck` | `selector` | Tick or untick |
| `waitFor` | `selector` | Wait until visible |
| `mark` | `name`, optional `total`, `orderButton`, `expectTotalChange` | Checkpoint: run the page detectors, read the total, read the order button label (the order button is never clicked) |

Selectors are CSS, or Playwright's `text=`, `role=`, `id=`, `data-testid=` and `xpath=` engines. Chaining with `>>` and internal engines are refused. Validation is strict: unknown keys, wrong types, long strings and control characters are rejected. Limits: 64 KiB, 100 steps, 500-character selectors, 1000-character values. Use test data only; never put real credentials or card numbers in a journey.

<!-- example: examples/journey.json -->
```json
{
  "$schema": "../schema/journey.schema.json",
  "version": 1,
  "name": "checkout",
  "startUrl": "https://shop.example/shop/product.html",
  "steps": [
    { "action": "click", "selector": "#add" },
    { "action": "mark", "name": "cart", "total": "#total" },
    { "action": "goto", "url": "https://shop.example/shop/checkout.html" },
    { "action": "mark", "name": "review", "total": "#total", "orderButton": "#place" }
  ]
}
```

Check a journey without scanning: `npx brightline validate-journey journey.json`.

## Playwright test helper

Use the page detectors inside your own Playwright tests. The helper reads the page you already opened; it fetches nothing itself. Countdown and journey checks are not part of the helper.

<!-- example: examples/checkout.spec.ts -->
```ts
import { expect as baseExpect, test } from '@playwright/test';
import { brightlineMatchers, scanPage } from '@afkzona/brightline/playwright';

const expect = baseExpect.extend(brightlineMatchers);

test('product page has no manipulative design', async ({ page }) => {
  await page.goto('/plain.html');
  await expect(page).toHaveNoBrightlineFindings({ minConfidence: 'medium' });
});

test('pre-ticked insurance is reported', async ({ page }) => {
  await page.goto('/preticked.html');
  const findings = await scanPage(page, { detectors: ['preselected-option'] });
  expect(findings.map((f) => f.provisions[0])).toContain('crd-art-22');
});
```

## GitHub Action

```yaml
- uses: afkzonagroup/brightline@<commit-sha>
  id: brightline
  with:
    url: https://staging.shop.example
    max-pages: '10'
    journey: .github/brightline/checkout.json
    fail-on: high
- uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
  if: always()
  with:
    name: brightline-report
    path: brightline-report
```

Inputs: `url` (required), `journey`, `max-pages`, `max-duration`, `out`, `format`, `detectors`, `fail-on`, `allow-addresses`, `ignore-robots`. Outputs: `findings`, `high`, `medium`, `low`, `report-dir`. Outputs and the job summary come from the report of the current run held in memory; a `report.json` already in the workspace is never read. Inputs reach the scanner as environment variables and an argument array, never through shell interpolation. The job summary shows counts and fixed titles only, no text from the scanned site. Pin the action to a commit SHA.

Chromium's sandbox stays on in the Action. On GitHub-hosted Ubuntu runners the Action allows unprivileged user namespaces (Ubuntu 23.10 and later restrict them through AppArmor), which the sandbox needs; that VM is discarded after the job. On self-hosted runners the Action changes nothing on the machine: if the sandbox cannot start there, the scan stops with a message that explains the choice.

## Docker

```sh
docker build -t brightline .
docker run --rm --cap-drop=ALL --security-opt no-new-privileges --read-only --tmpfs /tmp \
  -v "$PWD/out:/work/brightline-report" brightline scan https://shop.example
```

The image runs as the unprivileged `node` user, contains production dependencies and Chromium's headless shell only, and sets `BRIGHTLINE_NO_SANDBOX=1` because Chromium's own sandbox needs privileges that a default container does not grant. The container is the isolation boundary: drop all capabilities, forbid privilege escalation and keep the root file system read-only as above (tested with these flags); never add `--privileged`. Mount only the output directory, writable by user id 1000.

To scan a server running on the Docker host, map a name to the host gateway and allow its addresses explicitly, for example `--add-host shop.test:host-gateway` and `--allow-address <gateway IPv4> --allow-address <gateway IPv6>`. Brightline refuses private addresses unless you allow them.

## Configuration reference

All `scan()` options (CLI flags in brackets):

| Option | Default | Range |
| --- | --- | --- |
| `url` | required | http or https |
| `journey` [`--journey`] | none | validated journey |
| `maxPages` [`--max-pages`] | 10 | 0 to 200 |
| `maxDurationMs` [`--max-duration`] | 180 000 | 5 000 to 1 800 000 |
| `navigationTimeoutMs` | 30 000 | 1 000 to 120 000 |
| `maxResponseBytes` | 10 MiB | 64 KiB to 100 MiB |
| `maxTotalBytes` | 200 MiB | 1 MiB to 2 GiB, counts responses and request bodies |
| `maxRedirects` | 5 | 0 to 20 |
| `respectRobotsTxt` [`--ignore-robots`] | true | |
| `allowAddresses` [`--allow-address`] | none | exact IPs |
| `detectors` [`--detectors`] | all | detector ids |
| `outputDir` [`--out`] | none (no screenshots) | directory |
| `chromiumSandbox` [`--no-sandbox`] | true | |
| `viewport` | 1280 x 800 | |
| `locale` | `en-GB` | |
| `countdownWaitMs` | 7 000 | 3 000 to 60 000 |
| `maxCountdownPages` | 3 | 0 to 20 |
| `resolver` | system DNS | custom resolver for split-horizon DNS or tests |

## Limitations

- Heuristics, not judgement. Findings are prompts for review. Brightline cannot know whether a stock count, a deadline or a prior price is true.
- Known false-positive risks: per-visitor timers that are real (seat or cart holds) show as low `countdown-reset`; a timer that is not about an offer (for example a video's remaining time) and restarts on reload shows as high `countdown-reset`; a struck-through price that is in fact the 30-day lowest price shows as low `price-reduction-prior-price`; "Express" or "Premium" options that are free, or pre-selected paid options the consumer asked for earlier, show as `preselected-option`; a "Place order" button on a page where the obligation to pay is stated elsewhere shows as medium; a total that rises because of a choice the user made shows as low `hidden-costs` unless the journey marks `expectTotalChange`; mildly worded declines with a guilt word ("No, continue without discount") may show as low `confirmshaming`; marketing claims in reviews or editorial text may match scarcity patterns.
- Known false negatives: images and canvas text are not read; content inside shadow DOM is not read; claims and phrases in languages other than those listed are not matched; cookie banners inside cross-origin iframes are not measured; designs that only appear after scrolling or hovering may be missed.
- Phrase lists: English is written by the maintainers. Every phrase in German, French, Spanish, Italian, Dutch, Polish and Lithuanian is marked `source: "translation"` in `src/data/phrases.ts` and `src/legal/order-button-labels.ts` and **needs native-speaker review**. Only the 23 order-button labels marked `source: "official"` are taken from the legal text.
- Not covered: subscription traps and cancellation flows (CRD Art. 11a, DSA Art. 25(3)(c)), nagging (DSA Art. 25(3)(b)), "free" claims (UCPD Annex I point 20), bait advertising (points 5 and 6), fake reviews (points 23b and 23c), personalised pricing (CRD Art. 6(1)(ea)), accessibility, and cookie behaviour.
- Single-page apps that never trigger a navigation are scanned as one page unless you add a journey.
- Text blocks longer than 600 characters and DOMs beyond 20 000 elements are not fully examined; the report notes when a cap was reached.
- A site that detects automated browsers can show Brightline a different page. Page scripts run in the same JavaScript world as the collector and could tamper with what it reads; Brightline treats everything it reads from a page as untrusted data.

## Security

Brightline loads pages from the internet, so it is built to be safe to point at hostile sites:

- **SSRF protection.** Only http and https. URLs with credentials are refused. Host names are resolved and every address is checked; one blocked address blocks the request. Blocked: private, loopback, link-local, CGNAT, multicast, reserved, documentation and benchmarking ranges, IPv6 unique-local, link-local, site-local, NAT64, 6to4 and Teredo, IPv4-mapped and IPv4-compatible IPv6 forms, and cloud metadata addresses (169.254.169.254, fd00:ec2::254, 100.100.100.200, 168.63.129.16 and others). Decimal, octal and hexadecimal IPv4 forms are normalised first.
- **Every request is checked twice.** Route interception checks each request the browser makes. Playwright does not route redirect hops or WebSockets, so all browser traffic also goes through a local guard proxy that resolves, checks and then connects to the checked address only (pinned against DNS rebinding). Redirects are therefore re-checked hop by hop. WebSockets are refused; WebRTC UDP and QUIC are disabled.
- **No credentials.** Each scan uses fresh browser contexts with no stored state; no cookies, HTTP authentication or headers of yours are sent. Cookies a site sets live only inside that scan's context.
- **Limits** on pages, total time, request time, response size, total bytes, redirects, decompressed size and collected elements.
- **Hostile pages.** Everything read from a page is re-validated in Node, in-page evaluations have a deadline, pop-ups are closed when they open and any page left over is closed after each crawled page, findings per page and per scan are capped, and control characters from page content never reach your terminal.
- **Output.** Report files are written with mode 0600 in a 0700 directory, never through a symlinked file or `screenshots` directory. The HTML report has no scripts, escapes all content, embeds only JPEG screenshots from its own folder with size caps, and sets a strict Content-Security-Policy.
- Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## Dependencies

Runtime: **`playwright-core` 1.64.1** only, pinned. It drives the headless browser that renders pages, runs their scripts and measures computed styles and boxes, which static HTML parsing cannot do. `playwright-core` has no install script and does not download browsers; you install Chromium's headless shell once with `npx playwright-core install chromium-headless-shell`. Version 1.64.1 is the newest release that had been out for more than two weeks when Brightline 0.1.0 was built.

Development only: TypeScript, Vitest, ESLint with typescript-eslint, `@types/node`, and `@playwright/test` (to test the Playwright helper example). All versions are pinned in `package.json` and `package-lock.json`.

The JSON schemas in `schema/` document the formats; validation in code is hand-written and does not need a schema library.

## Enterprise

AFKzona Group offers, under a commercial licence and outside this repository: a hosted dashboard, continuous monitoring of many sites, SSO/SAML, roles, audit evidence packs, a legal-update feed, white-label reports, and SLA-backed support. See [COMMERCIAL.md](COMMERCIAL.md).

## Contributing

Issues and pull requests are welcome. Pull requests need a signed [Contributor Licence Agreement](CLA.md). See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

Copyright 2026 MB AFKzona Group.

[AGPL-3.0-only](LICENSE) with an additional attribution term under AGPL section 7(b) in [LICENSE-ADDITIONAL-TERMS.md](LICENSE-ADDITIONAL-TERMS.md): interfaces and HTML reports keep the notice "Brightline by AFKzona Group" with its link. A [commercial licence](COMMERCIAL.md) is available. "Brightline" is a trademark of MB AFKzona Group; forks must use another name ([TRADEMARKS.md](TRADEMARKS.md)).

## Disclaimer

Brightline reports possible issues found by automated heuristics. It is not legal advice, it does not decide whether anything is illegal, and it does not make any website compliant. The legal summaries are paraphrases; the official texts on EUR-Lex prevail.

Maintained by AFKzona Group.
