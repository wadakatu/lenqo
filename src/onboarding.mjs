import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function localOrigin(value) {
	const url = new URL(value);
	if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
		|| url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
		throw new Error("Use a loopback HTTP origin without a path, credentials, query, or fragment (e.g. http://127.0.0.1:3000).");
	}
	return url.origin;
}

export async function initializeProject({ root, configPath, origin, locale, configOnly }) {
	const previewOrigin = localOrigin(origin);
	if (!["en", "ja"].includes(locale)) throw new Error("--locale must be en or ja.");
	const relativeConfig = path.relative(root, configPath);
	if (!relativeConfig || relativeConfig.startsWith("..") || path.isAbsolute(relativeConfig)) {
		throw new Error("The config must be inside the project root.");
	}
	if (!configOnly && ["playwright.lenqo.config.mjs", path.join("lenqo-tests", "pages.capture.mjs")].includes(relativeConfig)) {
		throw new Error("--config must not point to a generated Playwright config or capture test.");
	}
	// A single config is imported by both the test and Playwright runner.
	const configImport = JSON.stringify(`./${relativeConfig.split(path.sep).join("/")}`);
	const testConfigImport = JSON.stringify(`../${relativeConfig.split(path.sep).join("/")}`);
	const files = new Map([[relativeConfig, `import { defineConfig } from "lenqo";

export default defineConfig({
	title: "Design review",
	locale: ${JSON.stringify(locale)},
	previewOrigin: ${JSON.stringify(previewOrigin)},
	groups: [{
		id: "product",
		title: "Product",
		pages: [{ id: "home", title: "Home", route: "/", states: { default: "Default" } }],
	}],
});
`]]);
	if (!configOnly) {
		files.set("playwright.lenqo.config.mjs", `import { defineConfig, devices } from "@playwright/test";
import config from ${configImport};

export default defineConfig({
	testDir: "./lenqo-tests",
	testMatch: "**/*.capture.mjs",
	outputDir: "test-results/lenqo/artifacts",
	reporter: "list",
	use: { baseURL: config.previewOrigin, trace: "retain-on-failure" },
	projects: [
		{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
		{ name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
	],
});
`);
		files.set("lenqo-tests/pages.capture.mjs", `import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { captureVisual } from "lenqo/playwright";
import config from ${testConfigImport};

const root = fileURLToPath(new URL("../", import.meta.url));
const pages = config.groups?.flatMap((group) => group.pages) ?? config.pages ?? [];
for (const entry of pages) {
	test(entry.id + " / default", async ({ page }, testInfo) => {
		const response = await page.goto(entry.route);
		expect(response?.ok(), "Expected a successful page response: " + entry.route).toBeTruthy();
		await captureVisual(page, testInfo, {
			pageId: entry.id,
			stateId: "default",
			outputDir: path.resolve(root, config.paths?.captures ?? "test-results/lenqo/captures"),
		});
	});
}
// Add explicit tests for interactive states; a state label alone does not perform an action.
`);
	}
	// Preflight every target. A conflict never leaves a half-generated starter.
	const conflicts = [];
	for (const name of files.keys()) {
		if (existsSync(path.join(root, name))) conflicts.push(name);
	}
	if (conflicts.length) throw new Error(`Initialization would overwrite: ${conflicts.join(", ")}. Keep existing files; integrate manually using 'lenqo guide'.`);
	const ignorePath = path.join(root, ".gitignore");
	const ignore = existsSync(ignorePath) ? await readFile(ignorePath, "utf8") : "";
	const additions = ["/test-results/lenqo/", "/.lenqo/"].filter((line) => !ignore.split(/\r?\n/).includes(line));
	for (const [name, content] of files) {
		await mkdir(path.dirname(path.join(root, name)), { recursive: true });
		await writeFile(path.join(root, name), content, { flag: "wx" });
	}
	if (additions.length) await appendFile(ignorePath, `${ignore && !ignore.endsWith("\n") ? "\n" : ""}\n# Lenqo local captures and feedback\n${additions.join("\n")}\n`);
	return {
		created: [...files.keys()],
		updated: additions.length ? [".gitignore"] : [],
		previewOrigin,
		nextSteps: configOnly ? ["Integrate captureVisual into your existing Playwright tests; run lenqo guide."] : [
			"npx playwright install chromium",
			`Start your application's development server at ${previewOrigin}.`,
			"npx lenqo doctor --json",
			"npx playwright test --config playwright.lenqo.config.mjs",
			"npx lenqo serve --background",
			"Open http://127.0.0.1:4400/catalog/ for human review.",
		],
	};
}

export async function diagnose({ root, configPath, normalizeConfig }) {
	const checks = [];
	const add = (id, status, message, action) => checks.push({ id, status, message, ...(action ? { action } : {}) });
	add("node", Number(process.versions.node.split(".")[0]) >= 22 ? "pass" : "fail", `Node ${process.versions.node}`, "Use Node.js 22+ (24 recommended).");
	const require = createRequire(path.join(root, "package.json"));
	try {
		require.resolve("lenqo/package.json");
		add("lenqo", "pass", "Lenqo is resolvable from this project.");
	} catch {
		add("lenqo", "fail", "Lenqo is not installed in this project.", "Install the package locally as documented in lenqo guide; a temporary npx install is insufficient for config imports.");
	}
	let chromium;
	try {
		const { version } = require("@playwright/test/package.json");
		const [major, minor] = version.split(".").map(Number);
		add("playwright", major > 1 || (major === 1 && minor >= 50) ? "pass" : "fail", `Playwright ${version}`, "Install @playwright/test >=1.50.");
		({ chromium } = require("@playwright/test"));
	} catch (error) {
		add("playwright", "fail", error.message, "Install @playwright/test locally with your project's package manager, then rerun doctor.");
	}
	if (chromium) {
		try {
			const browser = await chromium.launch({ headless: true, timeout: 10000 });
			await browser.close();
			add("chromium", "pass", "Headless Chromium launches successfully.");
		} catch (error) {
			add("chromium", "fail", error.message, "Run npx playwright install chromium (Linux: npx playwright install --with-deps chromium). If installed, check browser sandbox permissions.");
		}
	}
	let config;
	try {
		config = normalizeConfig((await import(pathToFileURL(configPath).href)).default);
		add("config", "pass", configPath);
	} catch (error) {
		add("config", "fail", error.message, "Run lenqo init for a new project; otherwise fix the existing lenqo.config.mjs.");
	}
	if (config) {
		for (const [name, fallback] of Object.entries({ captures: "test-results/lenqo/captures", catalog: "test-results/lenqo/catalog", reviews: ".lenqo/reviews.json", runtime: ".lenqo/run" })) {
			const relative = path.relative(root, path.resolve(root, config.paths[name] ?? fallback));
			if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) add(`path-${name}`, "fail", `${name} must be inside the project root.`, "Correct config.paths.");
		}
		try {
			const origin = localOrigin(config.previewOrigin);
			const response = await fetch(origin, { redirect: "manual", signal: AbortSignal.timeout(3000) });
			await response.body?.cancel();
			add("preview", response.status < 400 ? "pass" : "fail", `${origin} returned HTTP ${response.status}.`, "Start or repair the app server; verify configured page routes separately.");
		} catch (error) {
			add("preview", "fail", error.message, `Start the app server at ${config.previewOrigin}, then rerun doctor. Check loopback network permissions if it is already running.`);
		}
	}
	return { checks, ok: checks.every((check) => check.status !== "fail") };
}
