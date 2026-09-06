import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { defineConfig } from "../src/index.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "bin", "lenqo.mjs");

test("defineConfig preserves the typed configuration", () => {
	const config = { title: "Review", groups: [] };
	assert.equal(defineConfig(config), config);
});

test("init creates a starter configuration", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "lenqo-init-"));
	const result = spawnSync(process.execPath, [cliPath, "init", "--root", directory], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	const config = await readFile(path.join(directory, "lenqo.config.mjs"), "utf8");
	assert.match(config, /defineConfig/);
	assert.match(config, /groups:/);
	await access(path.join(directory, "playwright.lenqo.config.mjs"));
	await access(path.join(directory, "lenqo-tests/pages.capture.mjs"));
});

test("init preserves existing files and does not partially generate a conflicting starter", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "lenqo-conflict-"));
	await writeFile(path.join(directory, "playwright.lenqo.config.mjs"), "// customized");
	const result = spawnSync(process.execPath, [cliPath, "init", "--root", directory, "--json"], { encoding: "utf8" });
	assert.equal(result.status, 1);
	assert.equal(JSON.parse(result.stdout).ok, false);
	assert.match(JSON.parse(result.stdout).error.message, /would overwrite/);
	assert.equal(await readFile(path.join(directory, "playwright.lenqo.config.mjs"), "utf8"), "// customized");
	await assert.rejects(access(path.join(directory, "lenqo.config.mjs")));
});

test("init config-only supports custom origins and preserves existing ignore rules", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "lenqo-options-"));
	await writeFile(path.join(directory, ".gitignore"), "# keep me\n.env");
	const result = spawnSync(process.execPath, [cliPath, "init", "--root", directory, "--origin", "http://localhost:4321", "--locale", "ja", "--config-only", "--json"], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stdout + result.stderr);
	const data = JSON.parse(result.stdout);
	assert.deepEqual(data.created, ["lenqo.config.mjs"]);
	assert.equal(data.previewOrigin, "http://localhost:4321");
	assert.match(await readFile(path.join(directory, "lenqo.config.mjs"), "utf8"), /locale: "ja"/);
	assert.match(await readFile(path.join(directory, ".gitignore"), "utf8"), /^# keep me\n.env\n/);
	await assert.rejects(access(path.join(directory, "playwright.lenqo.config.mjs")));
});

test("invalid flags and unsafe origins fail before init writes anything", async () => {
	for (const args of [["--orign", "http://localhost:3000"], ["--origin"], ["--origin", "https://example.com"], ["--origin", "http://localhost:3000/app/"], ["--locale", "xx"], ["--background"], ["--config", "playwright.lenqo.config.mjs"]]) {
		const directory = await mkdtemp(path.join(os.tmpdir(), "lenqo-bad-init-"));
		const result = spawnSync(process.execPath, [cliPath, "init", "--root", directory, "--json", ...args], { encoding: "utf8" });
		assert.equal(result.status, 1, JSON.stringify(args));
		assert.equal(JSON.parse(result.stdout).ok, false);
		await assert.rejects(access(path.join(directory, "lenqo.config.mjs")));
	}
});

test("doctor works before initialization and returns actionable JSON", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "lenqo-doctor-"));
	const result = spawnSync(process.execPath, [cliPath, "doctor", "--root", directory, "--json"], { encoding: "utf8" });
	assert.equal(result.status, 1);
	const data = JSON.parse(result.stdout);
	assert.equal(data.schemaVersion, 1);
	assert.equal(data.ok, false);
	assert.equal(data.checks.find((check) => check.id === "config").status, "fail");
	assert.equal(data.checks.find((check) => check.id === "playwright").status, "fail");
	assert.ok(data.checks.filter((check) => check.status === "fail").every((check) => check.action));
});

test("guide is available without a project config or dependencies", () => {
	const result = spawnSync(process.execPath, [cliPath, "guide"], { cwd: os.tmpdir(), encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /first human review/);
});

test("invalid routes fail before capture discovery", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "lenqo-invalid-"));
	await writeFile(path.join(directory, "lenqo.config.mjs"), `export default {
		previewOrigin: "http://127.0.0.1:3000",
		groups: [{ id: "one", title: "One", pages: [{ id: "home", title: "Home", route: "home" }] }]
	};`);
	const result = spawnSync(process.execPath, [cliPath, "build", "--root", directory], { encoding: "utf8" });
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /route must start/);
});

test("generated paths cannot escape or target the project root", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "lenqo-path-"));
	await writeFile(path.join(directory, "lenqo.config.mjs"), `export default {
		previewOrigin: "http://127.0.0.1:3000",
		paths: { captures: "." },
		groups: [{ id: "one", title: "One", pages: [{ id: "home", title: "Home", route: "/" }] }]
	};`);
	const result = spawnSync(process.execPath, [cliPath, "clean", "--root", directory], { encoding: "utf8" });
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /inside the project root/);
});
