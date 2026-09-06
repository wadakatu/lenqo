import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	testMatch: "**/*.spec.mjs",
	outputDir: "test-results/playwright",
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://127.0.0.1:4410",
		trace: "retain-on-failure",
	},
	webServer: [
		{
			command: "node tests/fixtures/server.mjs",
			url: "http://127.0.0.1:4310/",
			reuseExistingServer: !process.env.CI,
		},
		{
			command: "node bin/lenqo.mjs serve --foreground --root . --config tests/fixtures/lenqo.config.mjs",
			url: "http://127.0.0.1:4410/__lenqo/health",
			reuseExistingServer: !process.env.CI,
		},
	],
});
