import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const workspace = await mkdtemp(path.join(os.tmpdir(), "lenqo-install-"));
const run = async (file, args, cwd = workspace) => {
	const result = await exec(file, args, { cwd, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
	return result.stdout;
};
const npm = (args, cwd) => run(process.execPath, [process.env.npm_execpath, ...args], cwd);
const cli = (...args) => run(process.execPath, [path.join(workspace, "node_modules/lenqo/bin/lenqo.mjs"), ...args]);
let reviewServer;
let browser;
const app = http.createServer((_request, response) => {
	response.writeHead(200, { "content-type": "text/html" });
	response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>Fresh consumer</h1><a href="/about/">About</a></body></html>');
});
try {
	app.listen(0, "127.0.0.1");
	await once(app, "listening");
	const origin = `http://127.0.0.1:${app.address().port}`;
	const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
	const fromRegistry = process.argv.includes("--registry");
	// Test the distributed package, never a symlink to the source tree.
	if (!fromRegistry) await npm(["pack", "--pack-destination", workspace], root);
	await writeFile(path.join(workspace, "package.json"), '{"name":"lenqo-fresh-consumer","private":true}');
	await npm(["install", ...(fromRegistry ? [] : ["--offline"]), "--save-dev", "--no-audit", "--no-fund", fromRegistry ? `lenqo@${metadata.version}` : path.join(workspace, `lenqo-${metadata.version}.tgz`), `@playwright/test@${metadata.devDependencies["@playwright/test"]}`]);
	assert.equal((await npm(["exec", "--offline", "--", "lenqo", "--version"])).trim(), metadata.version);
	const initialized = JSON.parse(await cli("init", "--origin", origin, "--locale", "ja", "--json"));
	assert.equal(initialized.ok, true);
	assert.match(await cli("guide"), /first human review/);
	const diagnostics = JSON.parse(await cli("doctor", "--json"));
	assert.equal(diagnostics.ok, true, JSON.stringify(diagnostics));
	// Change the capture directory to prove both generated files honor project config.
	const configFile = path.join(workspace, "lenqo.config.mjs");
	const original = await readFile(configFile, "utf8");
	const reservation = http.createServer();
	reservation.listen(0, "127.0.0.1");
	await once(reservation, "listening");
	const port = reservation.address().port;
	await new Promise((resolve) => reservation.close(resolve));
	await writeFile(configFile, original.replace('title: "Design review",', `title: "Design review",\n server: { port: ${port} },\n paths: { captures: "test-results/custom-captures" },`));
	const playwrightCLI = path.join(workspace, "node_modules/@playwright/test/cli.js");
	console.log(await run(process.execPath, [playwrightCLI, "test", "--config", "playwright.lenqo.config.mjs"]));
	const build = JSON.parse(await cli("build", "--json"));
	assert.equal(build.captureCount, 2);
	const captureArgs = [path.join(workspace, "node_modules/lenqo/bin/lenqo.mjs"), "serve", "--foreground"];
	reviewServer = spawn(process.execPath, captureArgs, { cwd: workspace, stdio: ["ignore", "pipe", "pipe"] });
	let logs = "";
	reviewServer.stdout.on("data", (chunk) => { logs += chunk; });
	reviewServer.stderr.on("data", (chunk) => { logs += chunk; });
	let ready = false;
	for (let i = 0; i < 50; i++) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/__lenqo/health`, { signal: AbortSignal.timeout(250) });
			if (response.ok) { ready = true; break; }
		} catch {}
		if (reviewServer.exitCode !== null) break;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	assert.ok(ready, logs);
	const status = JSON.parse(await cli("status", "--json"));
	assert.equal(status.running, true);
	browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(status.catalogURL);
	await page.waitForFunction(() => document.title.includes("Lenqo"));
	const images = page.locator(".capture img");
	assert.equal(await images.count(), 2);
	for (const image of await images.all()) {
		await image.scrollIntoViewIfNeeded();
		await image.evaluate((element) => element.decode());
		assert.ok(await image.evaluate((element) => element.naturalWidth > 0));
	}
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.screenshot({ path: path.join(workspace, "first-review.png"), fullPage: true });
	await page.locator("#preview-mode").click();
	await page.frameLocator("#preview-frame").getByRole("heading", { name: "Fresh consumer" }).waitFor();
	const comments = await fetch(`http://127.0.0.1:${port}/__lenqo/api/comments`).then((response) => response.json());
	assert.deepEqual(comments.comments, []);
	assert.deepEqual(errors, []);
	console.log(`Fresh install passed: init → doctor → desktop/mobile captures → build → served catalog.\nArtifacts: ${workspace}`);
} finally {
	await browser?.close();
	if (reviewServer && reviewServer.exitCode === null) {
		const closed = once(reviewServer, "exit");
		reviewServer.kill("SIGTERM");
		await closed;
	}
	app.closeAllConnections();
	await new Promise((resolve) => app.close(resolve));
}
