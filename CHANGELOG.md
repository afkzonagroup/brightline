# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Allow-list entries can name a port: `--allow-address 10.0.0.5:8080` or
  `[fd00::5]:8080` opens only that port on a private address. A bare address
  still opens every port. `scan()` now rejects invalid `allowAddresses`
  entries and more than 20 of them before any network activity.
- Open shadow roots are read: dialogs, buttons, links, checkboxes, text,
  prices and countdowns inside web components, nested shadow roots and
  slotted content are collected, and checkbox labels are found across the
  shadow boundary. The walk is iterative and bounded (100 000 elements, 2 000
  shadow roots, 32 levels). Evidence selectors for such elements are plain CSS
  paths through the host that Playwright resolves to the same element.
- Client-side navigation: hash routes (`#/checkout`) are crawled as pages of
  their own; a same-origin link that returns HTTP 404 on a direct load is
  opened by pushing it onto the history of the page that links to it, and
  scanned if the app renders it. Links inside open shadow roots are followed.
- Journeys: after a click, Brightline waits for requests in flight and for
  the DOM (including open shadow roots) to settle, at most 2.5 seconds; a
  click that changes the route inside the page scans the new route.
- Closed shadow roots and frames are documented as coverage limits.

### Changed

- Within one journey the same finding (detector, element, text and page) is
  listed once.
- Buttons, links and checkboxes are read within the first 100 000 elements
  of a page (light DOM and open shadow roots together); before, the light DOM
  was read without that bound.
- The order button label and the total of a journey mark are read as
  rendered, including slotted text in shadow roots.

## [0.1.1] - 2026-11-08

### Fixed

- Trailing-character trimming runs in linear time on hostile page text; amount parsing caps its input (#17).
- CI and release jobs allow the Chromium sandbox on GitHub-hosted runners (#6).

### Added

- Action self-test on a GitHub-hosted runner (#19).

### Changed

- Dependabot groups minor and patch updates and ignores major versions (#16).
- Release workflow skips versions already on npm.

## [0.1.0] - 2026-11-08

### Added

- Scanner library and `brightline` CLI: same-origin crawl with robots.txt
  support, optional declarative user journey, JSON and HTML reports.
- Detectors: countdown restarts (UCPD Annex I point 7), pre-selected paid
  extras and consent (CRD Art. 22, GDPR Art. 4(11) and 7), confirmshaming
  (UCPD Art. 5, 8 and 9), asymmetric choice in dialogs (GDPR Art. 4(11) and 7,
  UCPD Art. 5, DSA Art. 25 for platforms), scarcity / popularity / urgency
  claims to verify (UCPD Art. 6(1), Annex I points 7 and 18), price reductions
  without prior price (PID Art. 6a), order button wording (CRD Art. 8(2)),
  total increases between checkout steps (CRD Art. 6(1)(e), UCPD Art. 7(4)(c)).
- Official "order with obligation to pay" wording in 23 language versions,
  copied from EUR-Lex.
- Network guard: DNS and IP checks for all blocked ranges, route
  interception, and a pinned local guard proxy that re-checks redirect hops.
- Report format 1.0.0 with JSON Schema; self-contained HTML report with
  embedded screenshots and a strict Content-Security-Policy.
- Playwright test helper (`@afkzona/brightline/playwright`), GitHub Action and
  Docker image.

[Unreleased]: https://github.com/afkzonagroup/brightline/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/afkzonagroup/brightline/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/afkzonagroup/brightline/releases/tag/v0.1.0
