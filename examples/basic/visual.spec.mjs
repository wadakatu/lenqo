import { test } from "@playwright/test";
import { captureVisual } from "snaplogue/playwright";

test("home", async ({ page }, testInfo) => {
	await page.goto("/");
	await captureVisual(page, testInfo, { pageId: "home", stateId: "default" });
});
