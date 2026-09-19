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

test("Preview preserves its real viewport while fitting desktop and phone windows", async ({ page }, testInfo) => {
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	await page.goto("/catalog/");
	await page.getByRole("tab", { name: "Preview" }).click();
	await expect(page.frameLocator("#preview-frame").getByRole("heading", { name: "Fixture home" })).toBeVisible();
	for (const outerWidth of [1440, 390]) {
		await page.setViewportSize({ width: outerWidth, height: 1080 });
		for (const width of [1440, 768, 390]) {
			await page.locator(`.viewport-button[data-width="${width}"]`).click();
			await expect.poll(() => page.locator("#preview-frame").evaluate(frame => frame.contentWindow.innerWidth)).toBe(width);
			await expect(page.locator("#preview-size")).toHaveText(`${width}px`);
			await expect.poll(() => page.locator("#browser-frame").evaluate(element => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
			const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
			expect(overflow).toBeLessThanOrEqual(0);
			if (width === 1440) await page.screenshot({ path: testInfo.outputPath(`desktop-preview-${outerWidth}.png`), fullPage: true });
		}
		await page.screenshot({ path: testInfo.outputPath(`preview-${outerWidth}.png`), fullPage: true });
	}
	expect(errors).toEqual([]);
});

test("Preview keeps drafts, focus and scaled pin coordinates across scroll and save conflicts", async ({ page, request }, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 1080 });
	await page.goto("/catalog/");
	await page.getByRole("tab", { name: "Preview" }).click();
	await expect(page.frameLocator("#preview-frame").getByRole("heading", { name: "Fixture home" })).toBeVisible();
	const frame = page.locator("#preview-frame");
	await frame.evaluate(element => element.contentWindow.scrollTo(0, 160));
	await expect.poll(() => frame.evaluate(element => element.contentWindow.scrollY)).toBe(160);
	await page.locator("#preview-review-toggle").click();
	await page.locator('[data-preview-review-action="add"]').click();
	const layer = page.locator("#preview-review-layer");
	await layer.scrollIntoViewIfNeeded();
	const box = await layer.boundingBox();
	// Use screen coordinates: the iframe is scaled down but stores logical CSS pixels.
	await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);
	const draft = page.locator("#preview-review-message");
	const message = "スクロール後も入力とピン位置を保持する regression";
	await draft.fill(message);
	await draft.evaluate(element => {
		element.dataset.originalNode = "yes";
		element.focus();
		element.setSelectionRange(3, 8);
		element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "入力" }));
	});
	await frame.evaluate(element => element.contentWindow.scrollTo(0, 280));
	await expect.poll(() => frame.evaluate(element => element.contentWindow.scrollY)).toBe(280);
	// Wait for a browser paint after the scroll handler, not an arbitrary delay.
	await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	await expect(draft).toHaveValue(message);
	await expect(draft).toHaveAttribute("data-original-node", "yes");
	await expect(draft).toBeFocused();
	expect(await draft.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([3, 8]);
	await draft.dispatchEvent("compositionend", { data: "入力" });
	await page.locator("#preview-review-toggle").click();
	await page.locator("#preview-review-toggle").click();
	await expect(draft).toHaveValue(message);

	const document = await (await request.get("/__lenqo/api/comments")).json();
	expect((await request.put("/__lenqo/api/comments", { data: document })).ok()).toBeTruthy();
	await page.locator('#preview-review-draft-form button[type="submit"]').click();
	await expect(page.locator("#preview-review-drawer [role=alert]")).toContainText("another tab");
	await expect(draft).toHaveValue(message);
	await page.locator('#preview-review-draft-form button[type="submit"]').click();
	await expect(draft).toHaveCount(0);
	await expect(page.locator(".preview-review-comment").filter({ hasText: message })).toBeVisible();
	const saved = (await (await request.get("/__lenqo/api/comments")).json()).comments.find(comment => comment.message === message);
	expect(saved.viewportWidth).toBe(1440);
	expect(saved.x).toBeCloseTo(0.4, 2);
	const dimensions = await frame.evaluate(element => ({ height: element.contentWindow.innerHeight, page: Math.max(element.contentDocument.documentElement.scrollHeight, element.contentDocument.body.scrollHeight) }));
	expect(Math.abs(saved.y * dimensions.page - (160 + dimensions.height * 0.3))).toBeLessThan(2);
	await page.screenshot({ path: testInfo.outputPath("preview-saved-comment.png"), fullPage: true });
	await page.reload();
	await page.getByRole("tab", { name: "Preview" }).click();
	await page.locator("#preview-review-toggle").click();
	await expect(page.locator(".preview-review-comment").filter({ hasText: message })).toBeVisible();
});
