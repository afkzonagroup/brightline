# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through **GitHub Security Advisories**
("Report a vulnerability" on the repository's Security tab). Do not open a
public issue. If you cannot use GitHub, email info@afkzonagroup.lt with
"Brightline security" in the subject.

We aim to acknowledge reports within 3 working days and to agree a fix and
disclosure date with you. Supported version: the latest 0.x release.

## Threat model

### Assets

- **The machine and network that run the scan**: internal services, cloud
  metadata endpoints, localhost-only admin interfaces. This is the main asset:
  a scanner that fetches attacker-chosen URLs is a classic SSRF tool.
- **The operator's files**: the output directory and anything near it.
- **People who open the HTML report**: their browser must not run content
  from the scanned site.
- **CI secrets** when Brightline runs as a GitHub Action.
- **Integrity of findings**: reports should not be easy to forge from inside
  the scanned page into something that looks like a different result.

### Actors

- **Hostile website**: controls HTML, scripts, redirects, DNS for its own
  domain, response sizes and timing. Assumed to try SSRF, DNS rebinding,
  resource exhaustion, script injection into reports, and browser exploits.
- **Untrusted inputs from users of a shared deployment**: start URLs, journey
  files, report JSON passed to `renderHtmlReport`.
- **Hostile contributor**: pull requests that weaken a control, or add a
  dependency or workflow change.

### Trust boundaries

1. Scanner process ↔ Chromium renderer running the hostile page.
2. Chromium ↔ network, crossing the guard (route check, then guard proxy).
3. Journey file / CLI arguments / action inputs ↔ scanner.
4. Report files ↔ the person or tool that opens them.

### Mitigations

| Threat | Mitigation | Where | Tested in |
| --- | --- | --- | --- |
| SSRF to private, loopback, link-local, CGNAT, ULA, multicast, reserved and metadata addresses | Every host resolved; every answer checked; one blocked answer blocks; allow-list only for exact IPs and never for metadata | `src/net/ip.ts`, `src/net/guard.ts` | `test/unit/ip.test.ts`, `test/unit/guard.test.ts` |
| Alternative IP spellings (decimal, octal, hex, short forms, IPv4-mapped/compatible IPv6, NAT64, 6to4, Teredo) | WHATWG URL normalisation plus own inet_aton and IPv6 parsers; embedded IPv4 judged | `src/net/ip.ts` | `test/unit/ip.test.ts`, `test/unit/guard.test.ts` |
| Redirect to an internal address | Redirect hops are not routed by Playwright, so all browser traffic is forced through the guard proxy, which checks each connection; robots.txt redirects re-checked hop by hop | `src/net/proxy.ts`, `src/browser/session.ts`, `src/net/robots-fetch.ts` | `test/integration/scan.test.ts` ("blocks the redirect hop"), `test/unit/network.test.ts` |
| DNS rebinding between check and connect | Proxy and fetcher connect only to the address they checked (custom `lookup`), TLS still verified against the host name | `src/net/proxy.ts`, `src/net/fetcher.ts` | `test/unit/network.test.ts` ("DNS rebinding") |
| Sub-resources, fetch/XHR, iframes, workers, shared workers, beacons, EventSource, form posts, pop-ups, prefetch, WebSockets, WebRTC, QUIC | Route check on every routed request (shared workers are not routed and are stopped by the proxy); WebSockets closed; proxy refuses upgrades and methods a browser does not proxy; QUIC off; WebRTC limited to proxied UDP (none). Each refused request records its `stage` (`route` or `proxy`) | `src/browser/session.ts` | `test/integration/scan.test.ts` ("every browser-side SSRF vector", fixture `hostile-ssrf.html`) |
| Proxy abuse by other local processes | Proxy binds 127.0.0.1 on a random port with random credentials, constant-time comparison | `src/net/proxy.ts` | `test/unit/network.test.ts` |
| Non-http(s) schemes, URLs with credentials, internal host names | Refused before any network activity | `src/net/guard.ts` | `test/unit/guard.test.ts` |
| Resource exhaustion | Caps on pages, total time, request time, response size, decompressed size (zip bombs), total bytes in both directions (responses and request bodies, charged while streaming), redirects, elements collected, journey size and steps, URL length | `src/scan.ts`, `src/net/*`, `src/browser/page-ops.ts` | `test/unit/network.test.ts`, `test/integration/scan.test.ts` |
| Credentials leaking to the scanned site | Fresh contexts without stored state; `Authorization`/`Proxy-Authorization` stripped by the fetcher; no user cookies or headers accepted | `src/browser/session.ts`, `src/net/fetcher.ts` | `test/unit/network.test.ts` |
| Code execution from journeys | Journeys are data; strict validator with allow-listed actions, keys and selector engines; no `eval`, `new Function`, dynamic import or child processes with user input anywhere | `src/journey/schema.ts` | `test/unit/journey.test.ts` |
| Script injection into the HTML report | All values escaped; only http(s) links; no scripts; CSP `default-src 'none'` with a hashed style; screenshots read only from `screenshots/F0000.jpg` paths inside the report directory, real-path checked, JPEG magic bytes, size caps | `src/report/html.ts` | `test/unit/report.test.ts`, `test/integration/scan.test.ts` |
| Overwriting files via symlinks or path traversal | Fixed file names, validated; `O_NOFOLLOW`; a symlinked `screenshots` directory is refused; directories 0700, files 0600 | `src/util/files.ts` | `test/unit/misc.test.ts`, `test/unit/report.test.ts` |
| Hostile page tampering with the in-page collector (patched built-ins, wrong types, huge values, endless loops) | Every result from the page is re-validated and capped in Node; evaluations have a 15 s deadline after which the page is closed; page-supplied selectors are used only if they are plain CSS | `src/browser/sanitize.ts`, `src/browser/page-ops.ts` | `test/unit/sanitize.test.ts`, `test/integration/scan.test.ts` ("hostile pages") |
| Hostile page exhausting the collector with shadow DOM (very deep nesting, very many shadow roots) | The walk over open shadow roots is iterative (an explicit stack, no recursion) and bounded: 100 000 elements, 2 000 shadow roots, 32 levels; ancestor walks, rendered-text reads and the wait after a click have their own caps; the snapshot is marked truncated | `src/browser/page-scripts.ts`, `src/browser/page-ops.ts` | `test/integration/shadow-spa.test.ts` ("hostile shadow DOM") |
| Pop-up floods and report flooding | Pop-ups closed at once, at most 3 pages per context, every leftover page closed after each crawled page; at most 50 findings per page, 1000 per scan, 200 screenshots | `src/browser/session.ts`, `src/scan.ts` | `test/integration/scan.test.ts` |
| Terminal escape sequences from page content in CLI output | Control, C1 and bidi characters replaced in every printed line | `src/cli/main.ts` | `test/unit/cli.test.ts` |
| Browser exploit from a hostile page | Chromium's OS sandbox is on by default and is never turned off silently: if it cannot start, the scan stops with an explanation. Opt-out only by `--no-sandbox` / `BRIGHTLINE_NO_SANDBOX=1`, meant for containers. In Docker the container is the boundary: non-root user, run with `--cap-drop=ALL --security-opt no-new-privileges --read-only`. The Action keeps the sandbox on and allows unprivileged user namespaces only on GitHub-hosted Linux runners | `src/browser/session.ts`, `src/scan.ts`, `Dockerfile`, `action.yml` | `test/unit/misc.test.ts` (launch errors), `test/unit/cli.test.ts` (action.yml) |
| Script injection in the GitHub Action | Inputs passed as environment variables to a Node entry point and an argument array; no `${{ }}` inside `run:`; outputs and job summary are built from the in-memory report of the current run (a `report.json` planted in the workspace is never read); outputs are validated integers and the path with control characters removed; job summary uses fixed titles reduced to plain characters | `action.yml`, `src/action/entrypoint.ts` | `test/unit/cli.test.ts` |
| Stack traces or internals in CLI output | CLI prints one-line messages only | `src/cli/main.ts` | `test/unit/cli.test.ts` |
| Supply chain | One runtime dependency, pinned; lockfile committed; no install scripts; `files` allow-list; actions pinned by SHA; CI on pull requests and manual runs only, read-only token | `package.json`, `.github/` | `npm audit --omit=dev` in CI |

### Residual risks

- Chromium vulnerabilities: keep `playwright-core` updated (Dependabot is configured). Do not run Brightline as root outside a container.
- The guard cannot see inside HTTPS tunnels, so per-response size caps apply to plain HTTP and robots.txt; HTTPS traffic is limited by the total byte budget and timeouts.
- `--allow-address` and `allowAddresses` deliberately open a private address. A bare address opens every port on it, so a scanned page (or a third-party script it loads) can reach any service there. Give the port as well (`10.0.0.5:8080`, `[fd00::5]:8080`) to open only the service you are scanning. Use them only for your own servers. An IPv6 address with a port needs brackets: without them every colon belongs to the address, so the entry names a different address and allows nothing you meant.
- A countdown that is not about an offer (for example a video's remaining time) and restarts on reload is reported with high confidence; the reviewer has to look at what the timer shows.
- Site cookies set during a scan live in that scan's browser context and are sent back to the same site, as a normal browser would. Do not run journeys with real accounts.

### Coverage limits

These are limits of what Brightline reads, not security controls:

- **Closed shadow roots** are not read; page script cannot reach them.
- **Frames** are not read. Brightline never crosses into a cross-origin frame; requests a frame makes still pass the network guard.

Reading open shadow roots and following client-side routes did not change the threat model above: the assets, actors and trust boundaries are the same. A client-side route is pushed only for a same-origin URL that the crawl accepted (the browser refuses any other origin), robots.txt and the page and time budgets apply to it as to any page, and every request the page makes for it passes the route check and the guard proxy.

## Data flows

Brightline sends requests only to the sites you scan (and the resources those
pages load, subject to the guard). It has no telemetry and sends nothing to
AFKzona Group or anyone else. Reports stay in the output directory you choose.
Screenshots can contain whatever the scanned page shows; treat reports as
confidential if you scan non-public pages.
