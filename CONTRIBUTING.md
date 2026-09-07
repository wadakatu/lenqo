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

For onboarding and distribution changes, also run `npm run test:install`. It packs the package, installs the tarball into a temporary consumer with the project's pinned Playwright version, and exercises init, doctor, generated desktop/mobile capture tests, build, and the served catalog. Run `npm ci` and install Chromium first. A fresh machine may need registry access for dependency metadata even after `npm ci`. Artifacts remain in the printed temporary directory for inspection. Use `-- --tarball <path>` to test an existing artifact, or `-- --registry` to test the published version.

## Pull requests

Maintainers: follow [the release guide](docs/releases.md) for publishing. Normal pushes and pull requests do not publish packages.

- Keep the package dependency-light and local-first.
- Add or update browser coverage for visible behavior.
- Preserve keyboard access, visible focus, semantic controls, and reduced-motion behavior.
- Never include a user's generated captures or review comments in a change.
- Run `npm run check` and `npm test` before opening a pull request.

For substantial behavior or storage-format changes, open an issue first so compatibility and migration can be discussed.
