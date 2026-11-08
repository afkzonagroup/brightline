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

[Unreleased]: https://github.com/afkzonagroup/brightline/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/afkzonagroup/brightline/releases/tag/v0.1.0
