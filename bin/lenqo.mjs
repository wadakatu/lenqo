#!/usr/bin/env node

try {
	await import("../src/cli.mjs");
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	if (process.argv.includes("--json")) {
		console.log(JSON.stringify({ schemaVersion: 1, command: process.argv[2], ok: false, error: { message } }));
	} else {
		console.error(`Lenqo: ${message}`);
	}
	process.exitCode = 1;
}
