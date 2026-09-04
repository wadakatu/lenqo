import type { Page, TestInfo } from "@playwright/test";

export interface CaptureVisualOptions {
	pageId: string;
	stateId: string;
	outputDir?: string;
	settle?: boolean;
}

export declare function captureVisual(
	page: Page,
	testInfo: TestInfo,
	options: CaptureVisualOptions,
): Promise<string>;
