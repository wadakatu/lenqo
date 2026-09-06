import { test } from "@playwright/test";
import { captureVisual } from "lenqo/playwright";

test("home", async ({ page }, testInfo) => {
	await page.goto("/");
	await captureVisual(page, testInfo, { pageId: "home", stateId: "default" });
});
