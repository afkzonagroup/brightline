# Review record

Two review passes were made on the 0.1.0 build before any independent review.
Each finding below was fixed in the same pass and covered by a test where a
test is possible.

State after both passes: `npm run check` passes (typecheck, lint, 402 tests in
13 files); line coverage 93.9 % overall (detectors 100 %, report 98.8 %,
journey validation 100 %, network guard about 93 %); `npm audit --omit=dev`
reports 0 vulnerabilities.

## Pass 1: correctness, law, edge cases, API, tests

### What was checked

- Every provision cited against the official EUR-Lex text: UCPD Art. 5 to 9
  and Annex I (consolidated 27.09.2026, which includes the Directive (EU)
  2024/825 points such as 2a, 4a to 4c, 10a and 23d to 23j, so Annex I
  numbering in the catalogue matches the current text); CRD Art. 6(1)(e),
  6(6), 8(2) and 22 (consolidated 27.09.2026); PID Art. 6a (consolidated
  28.05.2022); DSA Art. 3(i), 19, 25 and 93; GDPR Art. 4(11), 7 and recital 32;
  ePrivacy Art. 2(f) and 5(3) only to word the README limitation.
- The 23 official "order with obligation to pay" labels, extracted from each
  language version of the consolidated CRD. The Irish consolidated text shows
  the subparagraph in English only, so no Irish label is listed.
- Wording of every finding: always "possible issue under", never "illegal",
  "unlawful", "violation" or "breach" (enforced by a test over all detector
  outputs).
- Each detector's positive and negative fixtures, thresholds and confidence
  levels; README table against the code.
- Public API, CLI flags and exit codes, report schema against real output.
- HTML report rendered and inspected at 1280 px and 390 px wide, light and dark.

### Found and fixed

| # | Finding | Fix |
| --- | --- | --- |
| 1 | An exception while analysing one page (for example a page that navigates away or breaks the collector) aborted the whole scan. | Page analysis errors are caught; the page is reported as `error` with "Analysis failed" and the crawl continues. Test: `hostile-dom.html`. |
| 2 | Very large DOMs were walked in full several times. | One element list capped at 20 000, reused for overlays, text and prices; the report notes when caps are reached. |
| 3 | Claim texts longer than 300 characters were skipped. | Limit raised to 600 and documented. |
| 4 | Screenshots of checkboxes showed only the box; screenshots of text showed a full-width strip that was unreadable on phones; very short text fell into the "small control" path and captured the whole page. | Toggles are captured with their label; text is cropped to its own extent with a text range; context widening limited to toggles. Verified visually. |
| 5 | HTML report overflowed horizontally at 390 px (long URLs in tables). | `table-layout: fixed`, `overflow-wrap: anywhere`, first column width. Verified at 390 px: no horizontal scroll. |
| 6 | Missing Chromium gave a long Playwright message. | Clear message with the install command. |
| 7 | README said "1.4 times smaller text" (inverted) and did not say that payment words are the maintainers' reading of "corresponding unambiguous formulation". | Corrected; limitation added. README also states that a site can detect automated browsers and tamper with what the collector reads. |
| 8 | An unverified historical claim about enforcement sweeps in the README introduction. | Removed; the README states only what the official texts say. |
| 9 | (Found while raising coverage, before pass 1.) The GitHub Action read `report.json` after a failed scan, so a stale report from an earlier run could be published as outputs. | Outputs are written only when the scan did not fail; test added. |

## Pass 2: security and hostile input

### What was checked

The SECURITY.md threat model line by line, from the point of view of a hostile
website, a hostile journey or report file, and a hostile contributor:
SSRF paths (literal IPs in every notation, DNS answers, mixed answers,
rebinding, redirects, sub-resources, WebSockets, WebRTC, pop-ups, prerender),
the guard proxy (authentication, methods, CONNECT targets, upgrades), resource
exhaustion, the in-page collector, selectors flowing from page to Playwright,
report escaping and file writing, terminal output, the GitHub Action, the
Docker image, and supply chain.

Each network control was removed in turn to prove the tests catch it:

- Without the guard proxy, 5 SSRF tests fail (redirect hops to loopback,
  mapped-IPv6 loopback and metadata reach the network; budget not enforced).
- Without the route check, the sub-resource test fails (requests are no longer
  refused before sending).

### Found and fixed

| # | Finding | Fix |
| --- | --- | --- |
| 1 | The collector runs in the page's own JavaScript world. A page can replace built-ins so that evaluation never returns (scan hangs) or returns wrong types and huge values. | Every in-page evaluation has a 15 s deadline after which the page is closed; all returned data is re-validated and capped in Node (`src/browser/sanitize.ts`). Tests: `hostile-loop.html`, `test/unit/sanitize.test.ts`. |
| 2 | Selectors returned by the page were passed back to Playwright for screenshots; a page could return engine selectors. | Only plain CSS selectors are accepted (no engine prefix including namespaced ones such as `internal:control=`, no `>>`, no control characters). The journey validator uses the same broader engine check. |
| 3 | A page could open many pop-ups, each a renderer. | Pop-ups are closed on creation and a context holds at most 3 pages; refusals are logged. Test: `hostile-popups.html`. |
| 4 | A page could flood the report and trigger thousands of screenshots. | At most 50 findings per page, 1000 per scan, 200 screenshots; notes say when a cap applied. Test: `many-claims.html`. |
| 5 | Text from scanned pages could reach the terminal with escape sequences or bidi controls (via URLs or error messages). | Every CLI line is cleaned of C0, C1 and bidi control characters. Test added. |
| 6 | The guard proxy forwarded any HTTP method. | Only methods a browser proxies are allowed; TRACE and others get 403. Test added. |
| 7 | It was not possible to tell which guard layer refused a request, so a test could not prove each layer works on its own. | `blockedRequests[].stage` is `route` or `proxy` (report schema updated); tests assert the stage. |
| 8 | Source files could contain invisible or bidirectional characters (an editing tool can turn `\u` escapes into raw characters). | Hygiene test fails on U+202A to U+202E, U+2066 to U+2069, U+2028/2029, zero-width characters, BOM, soft hyphen and raw control characters in any tracked text file. One such case had already been fixed in `src/journey/schema.ts` during the build. |
| 9 | `npm publish` could ship a stale `dist/`. | `prepack` runs the build (publisher-side only; there are still no install scripts). |
| 10 | Node 20 reaches end of life. | `engines` set to `>=22`, matching the Docker image and the Action. |

### Checked and left as is (documented residual risks)

- HTTPS responses pass the proxy as encrypted tunnels, so the per-response size
  cap applies to plain HTTP and robots.txt; HTTPS is bounded by the total byte
  budget and timeouts. A compressed response can still expand inside Chromium;
  a renderer crash ends that page only.
- A site can detect automated browsers and show different content, or tamper
  with what the collector reads. This can hide findings but cannot break out
  of the checks above.
- Chromium's own sandbox is off inside the Docker image (a default container
  cannot provide what it needs); the image runs as the unprivileged `node` user
  and the container is the boundary.
- Development-only advisory: `minimatch` (used by ESLint and typescript-eslint)
  has a moderate ReDoS advisory; fixed versions were less than two weeks old at
  build time. It is not part of the runtime dependency tree.

## For the independent review

- Legal mapping choices that are interpretation, not text: confirmshaming under
  UCPD Art. 5(2) and 8 to 9; asymmetric choice outside consent requests under
  UCPD Art. 5(2); social-proof numbers under Art. 6(1) only; payment words as a
  "corresponding unambiguous formulation".
- Translation phrase lists (DE, FR, ES, IT, NL, PL, LT) need native review.
- The attribution link in reports and `--help` points to https://afkzonagroup.lt.

## Independent review

A separate reviewer re-checked the build against the official texts and the
code, without relying on the two passes above.

State after the independent review: `npm run check` passes (typecheck, lint,
437 tests in 13 files); line coverage 94.8 % overall; `npm audit --omit=dev`
reports 0 vulnerabilities. The README quick start was run from a packed
tarball in an empty project against the local fixture site, and the Docker
image was built and run with `--cap-drop=ALL --security-opt no-new-privileges
--read-only --tmpfs /tmp` against a server on the Docker host; temporary files
and the image were removed afterwards.

### What was checked

- Legal texts, fetched from the Publications Office (the EUR-Lex source) in
  XHTML: CRD consolidated 27.09.2026 in all 24 language versions; UCPD
  consolidated 27.09.2026; PID consolidated 28.05.2022; DSA and GDPR as
  published. Every citation, paragraph and Annex I point number in
  `src/legal/provisions.ts`, every EUR-Lex anchor (`#art_5`, `#anx_I`, ...),
  the DSA Art. 3(i), 19, 25 and 93 scope statements, and each detector's
  mapping. All 23 official order-button labels were found verbatim in their
  language versions; the Irish version shows the subparagraph in English only
  (confirmed). The Finnish label was checked to be the one in the button
  sentence, not the identical words in the preceding sentence.
- No output states a breach as fact: detector explanations, report, CLI,
  README and package description.
- False positives and negatives with new realistic fixtures: a seat hold kept
  across reloads, honest strikethrough prices with a 30-day statement (DE, EN),
  a struck price next to "Free returns within 30 days", a percentage next to a
  textual "was" price, a checkout that states delivery on the cart page and
  labels the button "Place order and pay", symmetric consent banners in
  German, French, Lithuanian and English with "Allow necessary cookies only",
  a hostile German banner with a faint "Nur notwendige Cookies" link, and
  service checkboxes (data protection notice, express checkout, SMS updates).
- Security as an attacker: every IP spelling (decimal, octal, hex, short,
  IPv4-mapped, -compatible, -translated, NAT64, 6to4, Teredo, zone ids), DNS
  rebinding, redirects, a new end-to-end fixture with iframes, srcdoc,
  dedicated and shared workers, service worker registration, beacons,
  EventSource, form posts, noopener pop-ups, prefetch, preconnect,
  speculation rules, WebSockets and WebRTC TURN/STUN; proxy authentication,
  CONNECT targets and request bodies; journey validation and selector engines;
  report escaping with a hostile report JSON; terminal output; GitHub Action
  outputs and summary; Docker user and capabilities.
- Controls removed one at a time to prove the tests catch them, then restored:
  the guard proxy (6 SSRF tests fail; the new fixture reaches the internal
  server 6 times, including through a shared worker that Playwright does not
  route), metadata never allow-listable, terminal control-character removal,
  the journey selector-engine allow-list, the page-selector chaining check,
  the request-body budget, and the HTML escaping of numeric fields. The
  explicit `<-loopback>` proxy rule is a duplicate: Playwright adds it itself,
  so removing it changes nothing.

### Found and fixed

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | Medium | The GitHub Action read `report.json` from the output directory after the scan. With `format: html` no new JSON is written, so a `report.json` committed in a pull request was read and its values written to `$GITHUB_OUTPUT` without type checks (newline injection of extra outputs such as `report-dir`) and to the job summary. | Outputs and summary are built from the in-memory report of the current run (`onReport` hook in the CLI); counts must be safe integers, the path loses all control characters, summary cells keep plain characters only. `medium` and `low` outputs added. Tests with a planted file and hostile values. |
| 2 | Medium | Consent banners whose refuse option starts with an accepting verb ("Allow necessary cookies only", "Accept only essential") were classed as accept, giving a false "no option to refuse" finding and comparing the wrong pair of buttons. | Necessary-only phrases (EN, DE, FR, ES, IT, NL, PL, LT) make a control a decline option. Unit and fixture tests. |
| 3 | Medium | DSA Art. 25 was cited for consent requests although Art. 25(2) excludes practices covered by the GDPR (asymmetric choice and confirmshaming in consent dialogs). | Not cited for consent requests; kept as a secondary reference with its scope note elsewhere. |
| 4 | Medium | Confidence too high for patterns with common legitimate causes: a timer that restarts only in a new session (what a real seat or cart hold does) was medium; a non-consent dialog with a link-styled "No thanks" could be high under UCPD Art. 5(2). | Fresh-session-only restarts are low; asymmetric choice outside consent requests is capped at medium. |
| 5 | Medium | False negative: any "30 days" in a product container (for example "Free returns within 30 days") counted as a prior-price statement and hid a struck price. | A 30-day mention counts only with a "lowest" word (all languages of the day list) or a listed prior-price phrase. |
| 6 | Low | False positives in `preselected-option`: "data protection notice", "express checkout" and similar were read as paid extras; "Send me order updates by SMS" was high-confidence consent. | Weak cues (express, premium, protection, guarantee, tip) need an amount; specific cues added (protection plan, buyer protection, express delivery); contact-only cues give low consent; a pre-selected radio button is at most medium. |
| 7 | Low | A discount percentage next to a second amount (a reference price written as text, "was €80") was medium "no prior price shown". | Low, with a note to verify the other amount. |
| 8 | Low | A late charge already stated on the earlier page ("Delivery €4.99, added at checkout") was medium `hidden-costs`. | Amounts shown at each journey mark are recorded; a matching increase is low. The fixture cart's add-on price was changed so the existing medium test still means a hidden fee. |
| 9 | Low | Common order-button wordings with a payment meaning were medium: "Kostenpflichtig bestellen", "Zamawiam i płacę", "Ordina e paga", "Valider mon achat", "Finalizar compra", "met betaalverplichting". | Added to the payment words as `translation` (needs native and legal review, like the rest of the list). |
| 10 | Low | The HTML report inserted numeric fields (`summary.*`, `httpStatus`, `stepsRun`) without escaping; `renderHtmlReport` is public and may get an untrusted JSON report, where a `<meta http-equiv="refresh">` would pass the CSP. | Every value escaped; the confidence class takes known values only. Test with a hostile report. |
| 11 | Low | Request bodies through the guard proxy (plain HTTP and HTTPS tunnels) were not counted, so a page could make the scanner upload without limit. | Both directions charged to the byte budget while streaming. Test. |
| 12 | Low | A symlink named `screenshots` in the output directory redirected screenshot writes. | `ensureSubdir` refuses a symlinked or non-directory entry. Test. |
| 13 | Low | Pop-ups opened with `noopener` were closed only when a context held more than 3 pages. | Every page left in the crawl context is closed after each crawled page. |
| 14 | Low | A Chromium sandbox failure surfaced as a raw Playwright error; the Action kept the sandbox on but did nothing about Ubuntu's AppArmor restriction on user namespaces. | Clear message that keeps the sandbox on and names the container opt-out. The Action allows unprivileged user namespaces only on GitHub-hosted Linux runners and changes nothing on self-hosted ones (test on `action.yml`). Docker documented and tested with `--cap-drop=ALL --security-opt no-new-privileges --read-only`. |
| 15 | Info | GDPR Art. 7 and DSA Art. 19 paraphrases were broader than the text (Art. 7(2) concerns written declarations that also cover other matters; Art. 19 also covers the 12 months after losing micro/small status). | Paraphrases corrected. |

### Checked and left as is

- Byte budget is charged per chunk while responses stream (proxy and fetcher),
  not after a response completes.
- A countdown that is not about an offer (for example a video's remaining
  time) and restarts on reload is still reported with high confidence; this
  is listed as a residual risk in the README and SECURITY.md.
- `--allow-address` opens every port of that address; documented as a
  residual risk.
- The GitHub Action was not run on GitHub (no publishing); the sandbox step
  relies on the `kernel.apparmor_restrict_unprivileged_userns` sysctl of the
  hosted Ubuntu images.

### Owner decisions

- Whether to keep UCPD Art. 8 and 9 (aggressive practices, undue influence)
  for confirmshaming; it is an interpretation, cited as "possible issue".
- Whether to accept the added payment words and the necessary-only phrases
  before native-speaker and legal review, or ship English only for them.
- Whether `allowAddresses` should take `address:port` so a staging server can
  be opened without opening every service on that host.
- Whether a "verify what the timer shows" downgrade is wanted for countdowns
  without offer wording nearby (needs context text from the collector).
