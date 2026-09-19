# Changelog

All notable changes to Lenqo are documented here.

## 0.1.3 — 2026-09-19

- Validate Host and Origin on HTTP and WebSocket requests before serving reviews, captures, or the app proxy; support explicitly trusted hostnames through `server.allowedHosts`.
- Verify project/config and instance ownership for server lifecycle commands; replace PID-based stopping with a private-token shutdown request.
- Keep Live Preview drafts, focus, and text selections intact while scrolling, and retain draft text when reopening the comment drawer.
- Return errors for malformed URLs without crashing the server; reject static-file symlink escapes.
- Preserve the selected Preview viewport's real CSS width while scaling it to fit, including accurate pinned-comment coordinates.
- Add server security/lifecycle and browser regression coverage.

## 0.1.2 — 2026-09-08

- Refreshed the npm README with the Lenqo logo, real catalog and live-preview screenshots, and clearer onboarding links.
- Kept documentation images outside the npm package to avoid increasing installation size.
- No runtime or API changes.

## 0.1.1 — 2026-09-07

- Isolated GitHub Actions release verification and stage-only npm Trusted Publishing.
- Exact-tarball installation tests, checksum verification, and maintainer approval before publication.
- Pinned Actions, dependency update automation, and documented release security boundaries.
- Fixed first-install CI verification on machines without cached registry metadata.

## 0.1.0 — 2026-09-07

- Initial local-first visual review workspace.
- Playwright full-page capture helper.
- Group, page, and state navigation.
- Desktop/mobile filtering and device-aware full-capture review.
- Interactive proxied preview with pinned comments.
- English and Japanese interface locales.
- Atomic JSON persistence with revision conflict protection.
- Non-interactive starter with dedicated desktop/mobile Playwright capture configuration.
- Read-only setup diagnostics and machine-readable init, doctor, build, and status output.
- Bundled agent onboarding guide, available offline through `lenqo guide`.
- Fresh-consumer package installation and browser smoke coverage.
