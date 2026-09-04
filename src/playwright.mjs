import { mkdir } from "node:fs/promises";
import path from "node:path";

function safeSegment(value, name) {
	if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
		throw new Error(`${name} may contain only letters, numbers, underscores, and hyphens.`);
	}
	return value;
}

/**
 * Scrolls the page once so lazy-loaded assets settle before capture.
 *
 * @param {import("@playwright/test").Page} page
 */
async function settleLazyAssets(page) {
	await page.evaluate(async () => {
		const delay = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
		const root = document.scrollingElement ?? document.documentElement;
		const step = Math.max(window.innerHeight, 500);
		for (let top = 0; top < root.scrollHeight; top += step) {
			window.scrollTo(0, top);
			await delay(45);
		}
		window.scrollTo(0, 0);
		await Promise.race([
			Promise.all([...document.images].map((image) => {
				if (image.complete) return image.decode?.().catch(() => undefined);
				return new Promise((resolve) => {
					image.addEventListener("load", resolve, { once: true });
					image.addEventListener("error", resolve, { once: true });
				});
			})),
			delay(5000),
		]);
	});
	await page.waitForLoadState("networkidle").catch(() => {});
	await page.waitForTimeout(80);
}

/**
 * Captures a full-page PNG using Snaplogue's deterministic file convention.
 *
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").TestInfo} testInfo
 * @param {{ pageId: string; stateId: string; outputDir?: string; settle?: boolean }} options
 */
export async function captureVisual(page, testInfo, options) {
	if (!options?.pageId || !options?.stateId) {
		throw new Error("captureVisual requires pageId and stateId.");
	}
	if (options.settle !== false) await settleLazyAssets(page);
	const viewport = page.viewportSize();
	if (!viewport) throw new Error("captureVisual requires a fixed Playwright viewport.");
	const pageId = safeSegment(options.pageId, "pageId");
	const stateId = safeSegment(options.stateId, "stateId");
	const project = testInfo.project.name.replaceAll(/[^a-zA-Z0-9_-]/g, "-") || "playwright";
	const root = path.resolve(options.outputDir ?? "test-results/snaplogue/captures");
	const directory = path.join(root, pageId, stateId);
	const filename = `${project}--${viewport.width}x${viewport.height}.png`;
	const capturePath = path.join(directory, filename);
	await mkdir(directory, { recursive: true });
	await page.screenshot({ path: capturePath, fullPage: true, animations: "disabled" });
	await testInfo.attach(`snaplogue-${pageId}-${stateId}`, {
		path: capturePath,
		contentType: "image/png",
	});
	return capturePath;
}
