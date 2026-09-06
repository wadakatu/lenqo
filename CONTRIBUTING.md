# Contributing

Thanks for helping improve Lenqo.

## Local setup

```sh
mise install
npm install
npx playwright install chromium
npm test
```

The end-to-end suite generates fixture captures, starts a small preview site, launches Lenqo in the foreground, and exercises both Review and Preview modes.

For onboarding and distribution changes, also run `npm run test:install`. It packs the package, installs the tarball into a temporary consumer using the npm cache, and exercises init, doctor, generated desktop/mobile capture tests, build, and the served catalog. Run `npm ci` and install Chromium first to populate dependencies and the browser. Artifacts remain in the printed temporary directory for inspection.

## Pull requests

- Keep the package dependency-light and local-first.
- Add or update browser coverage for visible behavior.
- Preserve keyboard access, visible focus, semantic controls, and reduced-motion behavior.
- Never include a user's generated captures or review comments in a change.
- Run `npm run check` and `npm test` before opening a pull request.

For substantial behavior or storage-format changes, open an issue first so compatibility and migration can be discussed.
