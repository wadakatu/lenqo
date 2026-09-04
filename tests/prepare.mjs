import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const captureRoot = path.resolve("test-results/fixture/captures");
await rm(path.resolve("test-results/fixture"), { recursive: true, force: true });

const browser = await chromium.launch();
try {
	const captures = [
		{ pageId: "home", stateId: "default", project: "desktop", width: 1440, height: 900, accent: "#315cff" },
		{ pageId: "home", stateId: "default", project: "mobile", width: 390, height: 844, accent: "#315cff" },
		{ pageId: "home", stateId: "menu", project: "desktop", width: 1440, height: 900, accent: "#b8f05a" },
		{ pageId: "about", stateId: "default", project: "desktop", width: 1440, height: 900, accent: "#ea6a47" },
		{ pageId: "about", stateId: "default", project: "mobile", width: 390, height: 844, accent: "#ea6a47" },
	];
	for (const capture of captures) {
		const context = await browser.newContext({ viewport: { width: capture.width, height: capture.height } });
		const page = await context.newPage();
		await page.setContent(`<!doctype html><style>
			*{box-sizing:border-box}body{margin:0;background:#f8f5ed;color:#17201e;font:18px/1.6 system-ui,sans-serif}
			header{height:84px;padding:28px 7vw;border-bottom:1px solid #a7b2ae;font-weight:700}
			main{min-height:1500px;padding:12vh 8vw;background:linear-gradient(160deg,transparent 55%,${capture.accent} 55%)}
			h1{max-width:900px;margin:0;font:600 clamp(52px,9vw,128px)/.9 Georgia,serif;letter-spacing:-.06em}
			p{max-width:540px;margin-top:40px}
		</style><header>Snaplogue fixture</header><main><h1>${capture.pageId}<br>${capture.stateId}</h1><p>A deterministic full-page fixture used to review layout, viewport filtering, and pinned feedback.</p></main>`);
		const directory = path.join(captureRoot, capture.pageId, capture.stateId);
		await mkdir(directory, { recursive: true });
		await page.screenshot({
			path: path.join(directory, `${capture.project}--${capture.width}x${capture.height}.png`),
			fullPage: true,
		});
		await context.close();
	}
} finally {
	await browser.close();
}
