# Contributing

Thanks for helping improve Snaplogue.

## Local setup

```sh
mise install
npm install
npx playwright install chromium
npm test
```

The end-to-end suite generates fixture captures, starts a small preview site, launches Snaplogue in the foreground, and exercises both Review and Preview modes.

## Pull requests

- Keep the package dependency-light and local-first.
- Add or update browser coverage for visible behavior.
- Preserve keyboard access, visible focus, semantic controls, and reduced-motion behavior.
- Never include a user's generated captures or review comments in a change.
- Run `npm run check` and `npm test` before opening a pull request.

For substantial behavior or storage-format changes, open an issue first so compatibility and migration can be discussed.
