# Lenqo

Lenqo turns Playwright screenshots and a running local site into one focused visual-review workspace. Browse captures by product area, page, and state; compare desktop and mobile; open a full capture; then pin review comments directly on the image or live preview.

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

## Let your AI agent set it up

Paste this into your coding agent:

> Set up Lenqo in this application using https://github.com/wadakatu/lenqo/blob/main/docs/agents.md. Use the existing package manager and app server. Create desktop and mobile captures, preserve existing tests and review comments, and give me the running catalog URL so I can review the design myself.

The [agent guide](docs/agents.md) includes the complete installation, diagnostics, feedback workflow, and a short pointer for your project's agent instructions. After installation, `npx lenqo guide` prints the same guide offline.

## First review

Run these commands from your application's directory. With an existing pnpm, Yarn, or Bun project, use that package manager and preserve its lockfile.

```sh
npm install --save-dev lenqo @playwright/test
npx lenqo init --origin http://127.0.0.1:3000
npx playwright install chromium
```

Use your app's real local origin, such as `http://127.0.0.1:4321` for an Astro app. Add `--locale ja` for a Japanese catalog. `init` generates the Lenqo config, a dedicated Playwright config, and a capture test for each configured page, with desktop and mobile Chromium projects. It appends local-data paths to `.gitignore`. Existing target files are never overwritten. It does not change your package scripts or start your application.

Start your application's development server with its usual command, then:

```sh
npx lenqo doctor
npx playwright test --config playwright.lenqo.config.mjs
npx lenqo serve --background
```

Open **[http://127.0.0.1:4400/catalog/](http://127.0.0.1:4400/catalog/)**. Review compares screenshots; Preview lets you navigate your running app. Both support pinned feedback. Keep the app server and Lenqo running while reviewing; `npx lenqo stop` stops Lenqo only.

For repeatable installs, commit your lockfile. The starter requires only Chromium. Mobile is an emulation, not a physical-device or Safari test.

## Configure and extend

Edit the generated `lenqo.config.mjs`:

```js
import { defineConfig } from "lenqo";

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
	captures: "test-results/lenqo/captures",
	catalog: "test-results/lenqo/catalog",
	reviews: ".lenqo/reviews.json",
	runtime: ".lenqo/run",
}
```

Keep the server on a loopback host. Binding to another interface requires the explicit `server.allowRemote: true` escape hatch; Lenqo is a development tool, not an authenticated production service.

## Capture with Playwright

The starter captures every configured page's default state. For interactive states or existing Playwright suites, write explicit tests using the helper below. Use `npx lenqo init --config-only` if you only need a Lenqo config.

```js
import { test } from "@playwright/test";
import { captureVisual } from "lenqo/playwright";

test("home", async ({ page }, testInfo) => {
	await page.goto("/");
	await captureVisual(page, testInfo, {
		pageId: "home",
		stateId: "default",
	});
});
```

Use Playwright projects for viewport variants. The project name and viewport are encoded in each filename, while `pageId` and `stateId` create the directory hierarchy.

In your existing Playwright config, also set `use.baseURL` to your app's origin. Keep `outputDir` separate from persistent captures; Playwright cleans its output directory on each run. If you customize `paths.captures`, pass the same path as `outputDir` to `captureVisual`. The starter handles these settings for you.

```js
projects: [
	{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
	{ name: "mobile", use: { viewport: { width: 390, height: 844 } } },
]
```

Then capture and open the workspace:

```sh
npx playwright test tests/visual.spec.js
npx lenqo serve
```

Lenqo serves at `http://127.0.0.1:4400/catalog/` by default; it does not automatically open a browser. Start your application separately at `previewOrigin` to enable Preview mode.

## Commands

```text
lenqo init [--origin <url>] [--locale en|ja] [--config-only] [--json]
lenqo guide
lenqo doctor [--json] [--config <file>] [--root <directory>]
lenqo clean [--config <file>] [--root <directory>]
lenqo build [--config <file>] [--root <directory>]
lenqo serve [--background] [--config <file>] [--root <directory>]
lenqo status [--config <file>] [--root <directory>]
lenqo stop [--config <file>] [--root <directory>]
```

`build` writes the catalog HTML file, while `serve` also maps capture assets, enables the live proxy, and persists comments. Use the served workspace for review. Commit the review JSON only when feedback belongs in source control; otherwise ignore the configured review path in the consuming project.

`init`, `doctor`, `build`, and `status` support `--json` for agents and automation. `init` also accepts `--root` and `--config`. `doctor` checks local dependencies, launches Chromium, validates the config, and probes the app origin; failed checks include a suggested action and exit nonzero. It does not install anything. After UI changes, recapture and run `lenqo build`; reload the catalog for the latest images. See [the agent guide](docs/agents.md) for existing-suite integration, feedback handling, and the JSON contract.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `Cannot find package lenqo` from a config | Install Lenqo locally in the application, not only via a temporary `npx` invocation. |
| Chromium cannot launch | Run `npx playwright install chromium`; on Linux use `--with-deps`. Check browser sandbox permissions if binaries are already installed. |
| App unavailable / Preview fails | Start the app and match `previewOrigin` to its actual loopback HTTP origin. |
| `No captures found` | Run the capture tests with `--config playwright.lenqo.config.mjs`, then build/serve. |
| Port 4400 occupied | Stop the existing Lenqo server or change `server.port`; run `status --json`. |
| Init reports a conflict | Preserve existing files; follow `lenqo guide` to integrate instead of overwriting. |

## Design principles

Lenqo separates evidence from discussion. Playwright owns repeatable browser state and screenshot creation; Lenqo owns navigation, inspection, and review metadata. Generated captures remain disposable, while comments stay in a small human-readable document.

The UI deliberately avoids dashboard chrome and decorative AI-style gradients. A compact screen index, editorial contact sheet, blue review pins, and lime local-status signal keep attention on the product being reviewed.

## Development

```sh
mise install
npm install
npm test
npm run test:install
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the fixture and release workflow.

## License

MIT © 2026 Lenqo contributors
