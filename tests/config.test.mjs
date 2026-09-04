import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { defineConfig } from "../src/index.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "bin", "snaplogue.mjs");

test("defineConfig preserves the typed configuration", () => {
	const config = { title: "Review", groups: [] };
	assert.equal(defineConfig(config), config);
});

test("init creates a starter configuration", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "snaplogue-init-"));
	const result = spawnSync(process.execPath, [cliPath, "init", "--root", directory], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	const config = await readFile(path.join(directory, "snaplogue.config.mjs"), "utf8");
	assert.match(config, /defineConfig/);
	assert.match(config, /groups:/);
});

test("invalid routes fail before capture discovery", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "snaplogue-invalid-"));
	await writeFile(path.join(directory, "snaplogue.config.mjs"), `export default {
		previewOrigin: "http://127.0.0.1:3000",
		groups: [{ id: "one", title: "One", pages: [{ id: "home", title: "Home", route: "home" }] }]
	};`);
	const result = spawnSync(process.execPath, [cliPath, "build", "--root", directory], { encoding: "utf8" });
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /route must start/);
});

test("generated paths cannot escape or target the project root", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "snaplogue-path-"));
	await writeFile(path.join(directory, "snaplogue.config.mjs"), `export default {
		previewOrigin: "http://127.0.0.1:3000",
		paths: { captures: "." },
		groups: [{ id: "one", title: "One", pages: [{ id: "home", title: "Home", route: "/" }] }]
	};`);
	const result = spawnSync(process.execPath, [cliPath, "clean", "--root", directory], { encoding: "utf8" });
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /inside the project root/);
});
