# Snaplogue

Snaplogue turns Playwright screenshots and a running local site into one focused visual-review workspace. Browse captures by product area, page, and state; compare desktop and mobile; open a full capture; then pin review comments directly on the image or live preview.

It is local-first: no account, hosted dashboard, database, or browser extension is required.

## What it does

- Builds a responsive catalog from deterministic Playwright screenshots.
- Organizes larger products as `groups → pages → states`.
- Switches between static Review and interactive Preview without losing the current page.
- Filters desktop, mobile, or both capture sets.
- Fits full-page captures inside a desktop or phone-shaped review surface.
- Stores pinned feedback in a readable JSON file with optimistic concurrency protection.
- Proxies the local site so in-frame navigation, forms, HMR, and same-origin review pins work together.
- Ships English and Japanese interface copy.

## Requirements

- Node.js 22 or newer. Node.js 24 is recommended.
- `@playwright/test` 1.50 or newer.

## Install

```sh
npm install --save-dev snaplogue @playwright/test
npx playwright install chromium
npx snaplogue init
```

## Configure

Create `snaplogue.config.mjs`:

```js
import { defineConfig } from "snaplogue";

export default defineConfig({
	title: "Acme design review",
	locale: "en",
	previewOrigin: "http://127.0.0.1:3000",
	server: {
		port: 4400,
	},
	groups: [
		{
			id: "marketing",
			title: "Marketing",
			pages: [
				{
					id: "home",
					title: "Home",
					route: "/",
					states: {
						default: "Default",
						menu: "Menu open",
					},
				},
			],
		},
	],
});
```

Paths are relative to the project root and can be overridden:

```js
paths: {
	captures: "test-results/snaplogue/captures",
	catalog: "test-results/snaplogue/catalog",
	reviews: ".snaplogue/reviews.json",
	runtime: ".snaplogue/run",
}
```

Keep the server on a loopback host. Binding to another interface requires the explicit `server.allowRemote: true` escape hatch; Snaplogue is a development tool, not an authenticated production service.

## Capture with Playwright

```js
import { test } from "@playwright/test";
import { captureVisual } from "snaplogue/playwright";

test("home", async ({ page }, testInfo) => {
	await page.goto("/");
	await captureVisual(page, testInfo, {
		pageId: "home",
		stateId: "default",
	});
});
```

Use Playwright projects for viewport variants. The project name and viewport are encoded in each filename, while `pageId` and `stateId` create the directory hierarchy.

```js
projects: [
	{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
	{ name: "mobile", use: { viewport: { width: 390, height: 844 } } },
]
```

Then capture and open the workspace:

```sh
npx playwright test tests/visual.spec.js
npx snaplogue serve
```

Snaplogue opens at `http://127.0.0.1:4400/catalog/` by default. Start your application separately at `previewOrigin` to enable Preview mode.

## Commands

```text
snaplogue init [--root <directory>]
snaplogue clean [--config <file>] [--root <directory>]
snaplogue build [--config <file>] [--root <directory>]
snaplogue serve [--background] [--config <file>] [--root <directory>]
snaplogue status [--config <file>] [--root <directory>]
snaplogue stop [--config <file>] [--root <directory>]
```

`build` writes the catalog HTML file, while `serve` also maps capture assets, enables the live proxy, and persists comments. Use the served workspace for review. Commit the review JSON only when feedback belongs in source control; otherwise ignore the configured review path in the consuming project.

## Design principles

Snaplogue separates evidence from discussion. Playwright owns repeatable browser state and screenshot creation; Snaplogue owns navigation, inspection, and review metadata. Generated captures remain disposable, while comments stay in a small human-readable document.

The UI deliberately avoids dashboard chrome and decorative AI-style gradients. A compact screen index, editorial contact sheet, blue review pins, and lime local-status signal keep attention on the product being reviewed.

## Development

```sh
mise install
npm install
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the fixture and release workflow.

## License

MIT © 2026 Snaplogue contributors
