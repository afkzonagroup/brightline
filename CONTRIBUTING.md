# Contributing to Brightline

Thank you for helping. Please read this first.

## Before you start

- **Sign the CLA.** Every pull request needs a signed [Contributor Licence
  Agreement](CLA.md). Add the signature line from CLA.md to your first pull
  request. Without it we cannot merge.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Security issues go to GitHub Security Advisories, not public issues
  ([SECURITY.md](SECURITY.md)).

## Development

```sh
npm ci
npx playwright-core install chromium-headless-shell
npm run check      # typecheck + lint + tests
npm run coverage   # tests with coverage report in coverage/
```

Node.js 22 or later. Tests start local fixture servers on 127.0.0.1 and use
Playwright's bundled Chromium.

## Rules for changes

- **Legal accuracy.** Every rule cites the exact provision and links the
  official EUR-Lex text. Read the official text, not summaries. Findings say
  "possible issue under <provision>", never "illegal".
- **Phrases are data.** Add phrases in `src/data/phrases.ts`. English entries
  are `source: 'original'`; any other language is `source: 'translation'`
  unless copied verbatim from an official EU text (`'official'`, only in
  `src/legal/`). Native-speaker reviews of translations are very welcome.
- **Every detector change has tests**: a positive fixture, a negative fixture
  (a legitimate design that must not be flagged), and unit tests for the pure
  logic.
- **Security controls have tests that fail if the control is removed.** Do not
  weaken the network guard, the journey validator or report escaping without
  discussing it in an issue first.
- TypeScript strict mode, no `any`, no `@ts-ignore`, no `eslint-disable`
  without a written reason, no `eval`/`new Function`/`innerHTML`.
- New runtime dependencies need a strong reason, an exact version and an entry
  in the README "Dependencies" section.
- Keep commits small, with clear messages. Update CHANGELOG.md.

## Pull request checklist

- [ ] CLA signed
- [ ] `npm run check` passes
- [ ] Tests added or updated, including a negative case
- [ ] Provision references checked against EUR-Lex
- [ ] README and CHANGELOG updated where behaviour changes
