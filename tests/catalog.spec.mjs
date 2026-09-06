import { expect, test } from "@playwright/test";

test("catalog groups captures and keeps the selected page across modes", async ({ page }) => {
	await page.goto("/catalog/");
	await expect(page).toHaveTitle("Lenqo Fixture — Lenqo");
	await expect(page.getByRole("heading", { name: "Marketing" })).toBeVisible();
	await expect(page.locator(".capture")).toHaveCount(3);

	await page.getByRole("button", { name: /02 About/ }).click();
	await expect(page.getByRole("heading", { name: "About", level: 2 })).toBeVisible();
	await page.getByRole("tab", { name: "Preview" }).click();
	await expect(page.frameLocator("#preview-frame").getByRole("heading", { name: "About the fixture" })).toBeVisible();

	await page.getByRole("tab", { name: "Review", exact: true }).click();
	await expect(page.getByRole("heading", { name: "About", level: 2 })).toBeVisible();
});

test("viewport filtering and mobile full capture stay within the window", async ({ page }) => {
	await page.goto("/catalog/");
	await page.getByRole("button", { name: "Mobile" }).click();
	await expect(page.locator(".capture")).toHaveCount(1);
	await page.locator(".capture__image-button").click();
	const dialog = page.locator("#image-dialog");
	await expect(dialog).toHaveAttribute("data-device", "mobile");
	const box = await dialog.boundingBox();
	expect(box.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
	expect(box.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
});

test("review writes use revisions to protect comments from another tab", async ({ request }) => {
	const current = await request.get("/__lenqo/api/comments");
	expect(current.ok()).toBeTruthy();
	const document = await current.json();
	const responses = await Promise.all([
		request.put("/__lenqo/api/comments", { data: document }),
		request.put("/__lenqo/api/comments", { data: document }),
	]);
	expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
	const conflict = responses.find((response) => response.status() === 409);
	expect((await conflict.json()).document.revision).toBe(document.revision + 1);
});

test("catalog navigation remains usable at a phone viewport", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/catalog/");
	await expect(page.getByRole("tablist", { name: "View mode" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Marketing" })).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});
