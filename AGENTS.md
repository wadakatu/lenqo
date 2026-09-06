# Working on Lenqo

This repository contains the Lenqo tool itself. To install Lenqo in another application, read `docs/agents.md`; do not confuse that consumer workflow with this repository's fixture tests.

- Runtime: Node.js 22+, developed with Node 24 via `mise`. Install with `npm ci` and `npx playwright install chromium`.
- CLI: `bin/lenqo.mjs` handles errors; `src/cli.mjs` serves/builds the catalog; `src/onboarding.mjs` generates starter files and runs diagnostics.
- Public helper/types: `src/index.*` and `src/playwright.*`. Browser UI: `assets/catalog.html`.
- Run `npm run check`, `npm run test:unit`, and `npm run test:e2e`. For onboarding/package changes, also run `npm run test:install`; it packs and installs the package in a temporary consumer and runs the generated capture workflow.
- Keep the package local-first and dependency-light. Preserve existing consumer files and review data. Maintain the `--json` contract and keep user config logs separate from machine output.
- Update README and `docs/agents.md` when changing commands or setup. The guide is shipped in the package and exposed by `lenqo guide`.
- Do not include generated captures, comments, credentials, or local paths in commits. Browser tests may require the host's scoped browser/network permissions.
