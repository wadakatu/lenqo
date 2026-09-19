import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeAllowedHost, requestAllowed } from "../src/server-security.mjs";

const cli = fileURLToPath(new URL("../bin/lenqo.mjs", import.meta.url));
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test("authority checks require exact trusted hosts, ports and same origins", () => {
	const config = { host: "127.0.0.1", port: 4400 };
	for (const host of ["localhost:4400", "127.0.0.1:4400", "[::1]:4400"]) {
		assert.equal(requestAllowed({ headers: { host, origin: `http://${host}` } }, config), true);
	}
	for (const headers of [
		{}, { host: "evil.invalid:4400" }, { host: "localhost.evil.invalid:4400" },
		{ host: "localhost:4401" }, { host: "localhost:4400", origin: "null" },
		{ host: "localhost:4400", origin: "http://evil.invalid" },
		{ host: "localhost:4400", "sec-fetch-site": "cross-site" },
		{ host: "localhost:4400@evil.invalid" }, { host: "localhost:4400/" },
	]) assert.equal(requestAllowed({ headers }, config), false, JSON.stringify(headers));
	assert.equal(requestAllowed({ headers: { host: "review.test:4400" } }, { ...config, allowedHosts: [normalizeAllowedHost("REVIEW.test")] }), true);
	for (const host of ["*", "http://review.test", "review.test:4400", "a/b"]) {
		assert.throws(() => normalizeAllowedHost(host));
	}
});

async function command(root, ...args) {
	const child = spawn(process.execPath, [cli, ...args, "--root", root], { stdio: ["ignore", "pipe", "pipe"] });
	let output = "";
	child.stdout.on("data", chunk => { output += chunk; });
	child.stderr.on("data", chunk => { output += chunk; });
	const [code] = await once(child, "exit");
	return { code, output };
}

function request(port, url, headers = {}, method = "GET", body) {
	return new Promise((resolve, reject) => {
		const req = http.request({ hostname: "127.0.0.1", port, path: url, method, headers }, response => {
			let text = "";
			response.on("data", chunk => { text += chunk; });
			response.on("end", () => resolve({ status: response.statusCode, text }));
		});
		req.on("error", reject);
		req.setTimeout(3000, () => req.destroy(new Error("Request timed out")));
		req.end(body);
	});
}

function upgrade(port, headers) {
	return new Promise((resolve, reject) => {
		const socket = net.connect(port, "127.0.0.1", () => {
			socket.write(`GET /socket HTTP/1.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n${Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join("\r\n")}\r\n\r\n`);
		});
		socket.setTimeout(3000, () => socket.destroy(new Error("Upgrade timed out")));
		socket.on("error", reject);
		socket.once("data", data => { socket.destroy(); resolve(data.toString()); });
	});
}

test("server guards, malformed URLs and project-scoped lifecycle", { timeout: 30000 }, async t => {
	const root = await mkdtemp(path.join(os.tmpdir(), "lenqo-server-test-"));
	const upstream = http.createServer((_req, res) => res.end("fixture upstream"));
	let upgrades = 0;
	upstream.on("upgrade", (_req, socket) => {
		upgrades++;
		socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
	});
	upstream.listen(0, "127.0.0.1");
	await once(upstream, "listening");
	t.after(() => { upstream.closeAllConnections(); upstream.close(); });
	const reservation = net.createServer().listen(0, "127.0.0.1");
	await once(reservation, "listening");
	const port = reservation.address().port;
	await new Promise(resolve => reservation.close(resolve));
	const projects = [path.join(root, "a"), path.join(root, "b")];
	for (const directory of projects) {
		await mkdir(path.join(directory, "captures/home/default"), { recursive: true });
		await writeFile(path.join(directory, "captures/home/default/desktop--1440x900.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1cAAAAASUVORK5CYII=", "base64"));
		await writeFile(path.join(directory, "lenqo.config.mjs"), `export default ${JSON.stringify({
			previewOrigin: `http://127.0.0.1:${upstream.address().port}`,
			server: { port }, paths: { captures: "captures", catalog: "catalog", reviews: "reviews/comments.json", runtime: "run" },
			pages: [{ id: "home", title: "Home", route: "/" }],
		})};`);
	}
	const [a, b] = projects;
	const child = spawn(process.execPath, [cli, "serve", "--foreground", "--root", a], { stdio: ["ignore", "pipe", "pipe"] });
	let logs = "";
	child.stdout.on("data", chunk => { logs += chunk; });
	child.stderr.on("data", chunk => { logs += chunk; });
	t.after(async () => {
		if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
	});
	let health;
	for (let i = 0; i < 70; i++) {
		health = await request(port, "/__lenqo/health").catch(() => null);
		if (health?.status === 200) break;
		assert.equal(child.exitCode, null, logs);
		await pause(50);
	}
	assert.equal(health?.status, 200, logs);
	const statePath = path.join(a, "run/server.json");
	const state = await readFile(statePath, "utf8");

	await t.test("HTTP and WebSocket routes reject untrusted authorities before proxying", async () => {
		for (const url of ["/", "/catalog/", "/captures/test.png", "/__lenqo/health", "/__lenqo/api/comments"]) {
			assert.equal((await request(port, url, { host: `evil.invalid:${port}` })).status, 403, url);
		}
		for (const origin of ["http://evil.invalid", "null"]) assert.equal((await request(port, "/__lenqo/api/comments", { origin })).status, 403);
		assert.equal((await request(port, "/", { "sec-fetch-site": "cross-site" })).status, 403);
		assert.equal((await request(port, "/")).text, "fixture upstream");
		assert.match(await upgrade(port, { Host: `evil.invalid:${port}` }), /403/);
		assert.match(await upgrade(port, { Host: `localhost:${port}`, Origin: "http://evil.invalid" }), /403/);
		assert.equal(upgrades, 0);
		assert.match(await upgrade(port, { Host: `localhost:${port}`, Origin: `http://localhost:${port}` }), /426/);
		assert.equal(upgrades, 1);
		assert.equal((await request(port, "/__lenqo/stop", {}, "POST")).status, 403);
	});
	await t.test("bad paths return errors without terminating the server", async () => {
		for (const url of ["/captures/%ZZ", "/catalog/%E0%A4", "/%00"]) assert.equal((await request(port, url)).status, 400);
		assert.equal((await request(port, "/captures/missing.png")).status, 404);
		await writeFile(path.join(a, "private.txt"), "fixture secret");
		await symlink(path.join(a, "private.txt"), path.join(a, "captures/escape.txt"));
		assert.equal((await request(port, "/captures/escape.txt")).status, 404);
		assert.equal((await request(port, "/__lenqo/health")).status, 200);
	});
	await t.test("same-origin writes retain revision conflict protection", async () => {
		const body = (await request(port, "/__lenqo/api/comments")).text;
		const headers = { host: `localhost:${port}`, origin: `http://localhost:${port}`, "content-type": "application/json" };
		assert.equal((await request(port, "/__lenqo/api/comments", headers, "PUT", body)).status, 200);
		assert.equal((await request(port, "/__lenqo/api/comments", headers, "PUT", body)).status, 409);
	});
	await t.test("another project cannot reuse or stop the server", async () => {
		for (const args of [["serve", "--background"], ["status", "--json"], ["stop"]]) {
			const result = await command(b, ...args);
			assert.equal(result.code, 1, result.output);
			assert.match(result.output, /another project/);
			assert.equal((await request(port, "/__lenqo/health")).status, 200);
		}
		assert.equal((await command(a, "serve", "--foreground")).code, 1);
		assert.equal(await readFile(statePath, "utf8"), state);
		assert.equal((await command(a, "status", "--json")).code, 0);
	});
	await t.test("stop verifies instance state and never signals a stale PID", async () => {
		await writeFile(statePath, JSON.stringify({ ...JSON.parse(state), instanceId: "stale-instance" }));
		assert.equal((await command(a, "stop")).code, 1);
		assert.equal((await request(port, "/__lenqo/health")).status, 200);
		await writeFile(statePath, state);
		const result = await command(a, "stop");
		assert.equal(result.code, 0, result.output);
		await assert.rejects(readFile(statePath));
		await writeFile(path.join(a, "run/server.pid"), String(process.pid));
		const stale = await command(a, "stop");
		assert.equal(stale.code, 0, stale.output);
		assert.match(stale.output, /No process was stopped/);
	});
	await t.test("a verified background instance can be reused and stopped by its project", async () => {
		t.after(() => command(a, "stop"));
		const started = await command(a, "serve", "--background");
		assert.equal(started.code, 0, started.output);
		const instance = JSON.parse((await request(port, "/__lenqo/health")).text).instanceId;
		assert.notEqual(instance, JSON.parse(state).instanceId);
		const reused = await command(a, "serve", "--background");
		assert.equal(reused.code, 0, reused.output);
		assert.match(reused.output, /already running/);
		assert.equal(JSON.parse((await request(port, "/__lenqo/health")).text).instanceId, instance);
		const stopped = await command(a, "stop");
		assert.equal(stopped.code, 0, stopped.output);
	});
});
