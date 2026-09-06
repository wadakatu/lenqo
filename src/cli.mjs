#!/usr/bin/env node

import { closeSync, createReadStream, existsSync, openSync } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { initializeProject, diagnose } from "./onboarding.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(scriptPath), "..");
const packageVersion = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")).version;
const cliArgs = process.argv.slice(2);
const command = cliArgs[0] ?? "serve";
const { values } = parseArgs({ args: cliArgs.slice(1), options: {
	root: { type: "string" }, config: { type: "string" },
	origin: { type: "string" }, locale: { type: "string" },
	"config-only": { type: "boolean" }, json: { type: "boolean" },
	background: { type: "boolean" }, foreground: { type: "boolean" },
	help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" },
} });
const flags = new Set(Object.entries(values).filter(([, value]) => value === true).map(([key]) => `--${key}`));

function optionValue(name) {
	return values[name.replace(/^--/, "")];
}

function report(result, message) {
	console.log(values.json ? JSON.stringify({ schemaVersion: 1, command, ...result }) : message);
}

function printHelp() {
	console.log(`Lenqo — capture every state, review it live.

Usage:
  lenqo init [--origin <url>] [--locale en|ja] [--config-only] [--json]
  lenqo guide
  lenqo doctor [--json] [--config <file>] [--root <directory>]
  lenqo build [--config <file>] [--root <directory>]
  lenqo clean [--config <file>] [--root <directory>]
  lenqo serve [--background] [--config <file>] [--root <directory>]
  lenqo status [--config <file>] [--root <directory>]
  lenqo stop [--config <file>] [--root <directory>]

Options:
  --config <file>    Config path relative to the project root
  --root <directory> Project root (defaults to the current directory)
  --background       Run the review server in the background
  --origin <url>     App's loopback HTTP origin for init (default: http://127.0.0.1:3000)
  --locale en|ja     Catalog language for init (default: en)
  --config-only      Generate only lenqo.config.mjs for an existing capture setup
  --json             Machine-readable output for init, doctor, build, status
  --help             Show this help
  --version          Show the installed version`);
}

const requestedRoot = optionValue("--root") ?? process.cwd();
const projectRoot = path.resolve(requestedRoot);
const requestedConfig = optionValue("--config") ?? "lenqo.config.mjs";
const configPath = path.resolve(projectRoot, requestedConfig);

function resolveProjectPath(value, fallback) {
	const resolved = path.resolve(projectRoot, value ?? fallback);
	const relative = path.relative(projectRoot, resolved);
	if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`Configured paths must point inside the project root: ${resolved}`);
	}
	return resolved;
}

if (["help", "--help", "-h"].includes(command) || flags.has("--help")) {
	printHelp();
	process.exit(0);
}
if (["version", "--version", "-v"].includes(command) || flags.has("--version")) {
	console.log(packageVersion);
	process.exit(0);
}
const allowedOptions = {
	init: ["root", "config", "origin", "locale", "config-only", "json"],
	guide: [], doctor: ["root", "config", "json"], build: ["root", "config", "json"],
	status: ["root", "config", "json"], clean: ["root", "config"],
	serve: ["root", "config", "background", "foreground"], stop: ["root", "config"],
};
if (!allowedOptions[command]) throw new Error(`Unknown command: ${command}. Run lenqo --help.`);
for (const key of Object.keys(values)) {
	if (!allowedOptions[command].includes(key)) throw new Error(`--${key} is not supported by ${command}. Run lenqo --help.`);
}
if (values.background && values.foreground) throw new Error("Choose either --background or --foreground.");
if (command === "init") {
	const result = await initializeProject({ root: projectRoot, configPath, origin: values.origin ?? "http://127.0.0.1:3000", locale: values.locale ?? "en", configOnly: values["config-only"] });
	report({ ok: true, ...result }, `Created:\n${result.created.join("\n")}\nUpdated: ${result.updated.join(", ") || "none"}\n\nNext:\n${result.nextSteps.join("\n")}`);
	process.exit(0);
}
if (command === "guide") {
	console.log(await readFile(path.join(packageRoot, "docs", "agents.md"), "utf8"));
	process.exit(0);
}
if (!["doctor", "build", "clean", "serve", "status", "stop"].includes(command)) throw new Error(`Unknown command: ${command}. Run lenqo --help.`);
if (values.json && !["doctor", "build", "status"].includes(command)) throw new Error("--json is supported by init, doctor, build, and status.");
if (command === "doctor") {
	const result = await diagnose({ root: projectRoot, configPath, normalizeConfig });
	report(result, result.checks.map((check) => `${check.status.toUpperCase()} ${check.id}: ${check.message}${check.status === "fail" && check.action ? `\n  Next: ${check.action}` : ""}`).join("\n"));
	process.exit(result.ok ? 0 : 1);
}

if (!existsSync(configPath)) {
	throw new Error(`Lenqo config not found: ${configPath}\nRun \`lenqo init\` first.`);
}

const importedConfig = (await import(`${pathToFileURL(configPath).href}?t=${Date.now()}`)).default;

function normalizeConfig(input) {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("Lenqo config must export an object.");
	}
	const legacyPages = Array.isArray(input.pages) ? input.pages : [];
	const groups = Array.isArray(input.groups) && input.groups.length > 0
		? input.groups
		: [{ id: "pages", title: "Pages", pages: legacyPages }];
	const normalizedGroups = groups.map((group, groupIndex) => {
		if (!group || typeof group !== "object" || Array.isArray(group)) {
			throw new Error(`groups[${groupIndex}] must be an object.`);
		}
		if (!Array.isArray(group.pages)) {
			throw new Error(`groups[${groupIndex}].pages must be an array.`);
		}
		const pages = group.pages.map((page, pageIndex) => {
			if (!page || typeof page !== "object" || Array.isArray(page)) {
				throw new Error(`groups[${groupIndex}].pages[${pageIndex}] must be an object.`);
			}
			const route = boundedString(page.route, `groups[${groupIndex}].pages[${pageIndex}].route`, 500);
			if (!route.startsWith("/")) {
				throw new Error(`groups[${groupIndex}].pages[${pageIndex}].route must start with "/".`);
			}
			if (page.states !== undefined && (!page.states || typeof page.states !== "object" || Array.isArray(page.states))) {
				throw new Error(`groups[${groupIndex}].pages[${pageIndex}].states must be an object.`);
			}
			const stateEntries = Object.entries(page.states ?? {});
			const states = Object.fromEntries(stateEntries.map(([stateId, stateTitle]) => [
				boundedIdentifier(stateId, `groups[${groupIndex}].pages[${pageIndex}].states key`),
				boundedString(stateTitle, `groups[${groupIndex}].pages[${pageIndex}].states.${stateId}`, 160),
			]));
			return {
				id: boundedIdentifier(page.id, `groups[${groupIndex}].pages[${pageIndex}].id`),
				title: boundedString(page.title, `groups[${groupIndex}].pages[${pageIndex}].title`, 160),
				route,
				states,
			};
		});
		return {
			id: boundedIdentifier(group.id, `groups[${groupIndex}].id`),
			title: boundedString(group.title, `groups[${groupIndex}].title`, 120),
			pages,
		};
	});
	const groupIds = normalizedGroups.map((group) => group.id);
	if (new Set(groupIds).size !== groupIds.length) {
		throw new Error("Group ids must be unique.");
	}
	const pageIds = normalizedGroups.flatMap((group) => group.pages.map((page) => page.id));
	if (new Set(pageIds).size !== pageIds.length) throw new Error("Page ids must be unique across all groups.");
	const previewOrigin = new URL(input.previewOrigin ?? "http://127.0.0.1:3000");
	if (previewOrigin.protocol !== "http:") {
		throw new Error("previewOrigin must be a local http URL.");
	}
	const serverHost = input.server?.host ?? "127.0.0.1";
	const allowRemote = input.server?.allowRemote === true;
	if (!["127.0.0.1", "localhost", "::1"].includes(serverHost) && !allowRemote) {
		throw new Error("Refusing a non-loopback server host. Set server.allowRemote to true if this is intentional.");
	}
	const serverPort = Number(input.server?.port ?? 4400);
	if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) {
		throw new Error("server.port must be an integer between 1 and 65535.");
	}
	return {
		title: boundedString(input.title ?? "Design review", "title", 160),
		locale: input.locale === "ja" ? "ja" : "en",
		previewOrigin: previewOrigin.origin,
		server: {
			host: serverHost,
			port: serverPort,
			allowRemote,
		},
		paths: input.paths ?? {},
		groups: normalizedGroups,
	};
}

const config = normalizeConfig(importedConfig);
const capturesRoot = resolveProjectPath(config.paths.captures, "test-results/lenqo/captures");
const catalogRoot = resolveProjectPath(config.paths.catalog, "test-results/lenqo/catalog");
const catalogPath = path.join(catalogRoot, "index.html");
const reviewPath = resolveProjectPath(config.paths.reviews, ".lenqo/reviews.json");
const reviewRoot = path.dirname(reviewPath);
const runtimeRoot = resolveProjectPath(config.paths.runtime, ".lenqo/run");
const templatePath = path.join(packageRoot, "assets", "catalog.html");
const pidPath = path.join(runtimeRoot, "server.pid");
const logPath = path.join(runtimeRoot, "server.log");
const host = config.server?.host ?? "127.0.0.1";
const port = config.server?.port ?? 4400;
const urlHost = host === "::1" ? "[::1]" : host;
const catalogURL = `http://${urlHost}:${port}/catalog/`;
const healthURL = `http://${urlHost}:${port}/__lenqo/health`;

const mimeTypes = new Map([
	[".html", "text/html; charset=utf-8"],
	[".png", "image/png"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".svg", "image/svg+xml"],
	[".css", "text/css; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
]);

async function walk(directory) {
	if (!existsSync(directory)) return [];
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const entryPath = path.join(directory, entry.name);
			return entry.isDirectory() ? walk(entryPath) : [entryPath];
		}),
	);
	return files.flat();
}

async function readPngSize(filePath) {
	const handle = await readFile(filePath);
	if (handle.toString("ascii", 1, 4) !== "PNG") {
		throw new Error(`Unsupported image: ${filePath}`);
	}
	return {
		width: handle.readUInt32BE(16),
		height: handle.readUInt32BE(20),
	};
}

function naturalLabel(value) {
	return value
		.split("-")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

const interfaceMessages = {
	en: {
		locale: "en-US",
		modeLabel: "View mode",
		screenIndex: "Screens",
		liveDescription: "Use the live site to check links, forms, and menus at each viewport width.",
		previewActions: "Preview controls",
		home: "Home",
		homeAria: "Go home",
		back: "Back",
		forward: "Forward",
		reload: "Reload",
		selectPage: "Select a preview page",
		viewportWidths: "Viewport widths",
		review: "Review",
		openNewTab: "Open in new tab ↗",
		liveFrame: "Live site preview",
		livePositions: "Live Preview review positions",
		pickHint: "Click the position to review · Esc to cancel",
		liveComments: "Live Preview review comments",
		closeCapture: "Close full capture",
		capturePositions: "Review positions",
		captureComments: "Review comments",
		noCaptures: "No captures are available for this page.",
		reviewDescription: "Compare states and viewport sizes. Open a capture to review it at full size.",
		deviceLabel: "Viewports",
		deviceGroup: "Filter captures by viewport",
		allDevices: "All",
		desktopOnly: "Desktop",
		mobileOnly: "Mobile",
		selecting: "Pick a position…",
		showReview: "Show review {number}",
		commentLabel: "Comment for this position",
		capturePlaceholder: "Example: Increase the contrast between this heading and the background…",
		saving: "Saving…",
		saveComment: "Save comment",
		cancel: "Cancel",
		captureGuide: "Pins on the image match the comments. Resolve each comment after the change is complete.",
		capturePickGuide: "Click the position you want to review on the image.",
		addComment: "+ Add comment",
		selectingPosition: "Selecting a position…",
		resolve: "Resolve",
		reopen: "Reopen",
		emptyCaptureComments: "No comments yet. Pick a position on the image to leave focused feedback.",
		externalGuide: "Comments cannot be added to external pages. Return to a page in this catalog.",
		previewPlaceholder: "Example: Make this button easier to find…",
		previewGuide: "Comments are saved for the current route and viewport width. Site interaction pauses only while choosing a position.",
		jumpToPosition: "Show position",
		emptyPreviewComments: "No comments for this route and viewport yet.",
		saveFailed: "The comment could not be saved.",
		loadFailed: "The review store could not be loaded.",
		serveHint: "Open the catalog with `lenqo serve` to save comments.",
		selectPagePlaceholder: "Select a page",
		commentRequired: "Enter a comment.",
		storageLabel: "LOCAL · .lenqo/reviews.json",
		captureAlt: "{page}, {state}, {width}px viewport",
		ungrouped: "Ungrouped",
		loadingCaptures: "Loading captures",
		localWorkspace: "Local workspace",
		livePreview: "Live preview",
		pinnedFeedback: "Pinned feedback",
		liveFeedback: "Live feedback",
		externalPage: "External page",
	},
	ja: {
		locale: "ja-JP",
		modeLabel: "表示モード",
		screenIndex: "画面一覧",
		liveDescription: "実際のサイトを操作できます。リンク、フォーム、メニューの動きを端末幅ごとに確認してください。",
		previewActions: "プレビュー操作",
		home: "ホーム",
		homeAria: "ホームへ戻る",
		back: "戻る",
		forward: "進む",
		reload: "再読み込み",
		selectPage: "プレビューするページ",
		viewportWidths: "端末幅",
		review: "レビュー",
		openNewTab: "別タブで開く ↗",
		liveFrame: "サイトのライブプレビュー",
		livePositions: "Live Previewのレビュー位置",
		pickHint: "指摘したい位置をクリック · Escでキャンセル",
		liveComments: "Live Previewのレビューコメント",
		closeCapture: "拡大表示を閉じる",
		capturePositions: "レビュー位置",
		captureComments: "レビューコメント",
		noCaptures: "このページのキャプチャはありません。",
		reviewDescription: "同じページの状態と端末差をまとめています。画像を押すと原寸で確認できます。",
		deviceLabel: "表示端末",
		deviceGroup: "表示する端末",
		allDevices: "両方",
		desktopOnly: "PCのみ",
		mobileOnly: "モバイルのみ",
		selecting: "位置を選択…",
		showReview: "レビュー {number}を表示",
		commentLabel: "この位置への指摘",
		capturePlaceholder: "例：見出しと背景のコントラストをもう少し強くしたい…",
		saving: "保存中…",
		saveComment: "コメントを保存",
		cancel: "キャンセル",
		captureGuide: "画像上のピンとコメントが対応します。修正後は対応済みにできます。",
		capturePickGuide: "指摘したい位置を画像上でクリックしてください。",
		addComment: "＋ 指摘を追加",
		selectingPosition: "位置を選択中…",
		resolve: "対応済みにする",
		reopen: "未対応へ戻す",
		emptyCaptureComments: "まだコメントはありません。画像上の位置を選んで修正点を残せます。",
		externalGuide: "外部ページにはコメントを残せません。カタログ内のページへ戻ってください。",
		previewPlaceholder: "例：このボタンをもう少し目立たせたい…",
		previewGuide: "現在のページと表示幅に紐づけて保存します。位置を選ぶ間だけサイト操作が一時停止します。",
		jumpToPosition: "位置を見る",
		emptyPreviewComments: "このページ・表示幅のコメントはまだありません。",
		saveFailed: "コメントを保存できませんでした。",
		loadFailed: "レビュー保存領域を読み込めませんでした。",
		serveHint: "保存機能を使うには `lenqo serve` でカタログを開いてください。",
		selectPagePlaceholder: "ページを選択",
		commentRequired: "コメントを入力してください。",
		storageLabel: "LOCAL · .lenqo/reviews.json",
		captureAlt: "{page}の{state}、{width}px表示",
		ungrouped: "未分類",
		loadingCaptures: "キャプチャを読み込み中",
		localWorkspace: "ローカル環境",
		livePreview: "ライブプレビュー",
		pinnedFeedback: "画像への指摘",
		liveFeedback: "ライブ画面への指摘",
		externalPage: "外部ページ",
	},
};

async function buildCatalog() {
	const files = (await walk(capturesRoot)).filter((file) => file.endsWith(".png"));
	if (files.length === 0) {
		throw new Error(`No captures found in ${capturesRoot}. Run your Playwright capture tests first.`);
	}

	const captures = await Promise.all(
		files.map(async (file) => {
			const relative = path.relative(capturesRoot, file);
			const parts = relative.split(path.sep);
			if (parts.length !== 3) return null;
			const [pageId, stateId, filename] = parts;
			const match = filename.match(/^(.+)--(\d+)x(\d+)\.png$/);
			if (!match) return null;
			const size = await readPngSize(file);
			return {
				pageId,
				stateId,
				project: match[1],
				viewport: { width: Number(match[2]), height: Number(match[3]) },
				image: { width: size.width, height: size.height },
				src: `../captures/${relative.split(path.sep).map(encodeURIComponent).join("/")}`,
			};
		}),
	);

	const validCaptures = captures.filter(Boolean);
	const configuredPages = config.groups.flatMap((group) =>
		group.pages.map((page) => ({ ...page, groupId: group.id })),
	);
	const configuredPageIds = configuredPages.map((page) => page.id);
	if (new Set(configuredPageIds).size !== configuredPageIds.length) {
		throw new Error("Page ids must be unique across all groups.");
	}
	const knownPageIds = new Set(configuredPageIds);
	const extraPageIds = [
		...new Set(validCaptures.map((capture) => capture.pageId)),
	].filter((pageId) => !knownPageIds.has(pageId));
	const pageDefinitions = [
		...configuredPages,
		...extraPageIds.map((pageId) => ({
			id: pageId,
			title: naturalLabel(pageId),
			route: `/${pageId}/`,
			states: {},
			groupId: "ungrouped",
		})),
	];

	const pages = pageDefinitions.map((page) => {
		const pageCaptures = validCaptures.filter((capture) => capture.pageId === page.id);
		const configuredStateIds = Object.keys(page.states ?? {});
		const extraStateIds = [
			...new Set(pageCaptures.map((capture) => capture.stateId)),
		].filter((stateId) => !configuredStateIds.includes(stateId));
		const stateIds = [...configuredStateIds, ...extraStateIds];
		return {
			id: page.id,
			title: page.title,
			route: page.route,
			groupId: page.groupId,
			states: stateIds
				.map((stateId) => ({
					id: stateId,
					title: page.states?.[stateId] ?? naturalLabel(stateId),
					captures: pageCaptures
						.filter((capture) => capture.stateId === stateId)
						.sort((a, b) => b.viewport.width - a.viewport.width),
				}))
				.filter((state) => state.captures.length > 0),
		};
	});

	const manifest = {
		title: config.title,
		locale: config.locale,
		labels: {
			...interfaceMessages[config.locale],
			storageLabel: `LOCAL · ${path.relative(projectRoot, reviewPath).split(path.sep).join("/")}`,
		},
		generatedAt: new Date().toISOString(),
		groups: [
			...config.groups.map((group) => ({ id: group.id, title: group.title })),
			...(extraPageIds.length > 0 ? [{ id: "ungrouped", title: interfaceMessages[config.locale].ungrouped }] : []),
		],
		pages,
		captureCount: validCaptures.length,
	};
	const template = await readFile(templatePath, "utf8");
	const serialized = JSON.stringify(manifest).replaceAll("<", "\\u003c");
	const html = template.replace("__LENQO_DATA__", serialized);

	await mkdir(catalogRoot, { recursive: true });
	const temporaryPath = `${catalogPath}.tmp`;
	await writeFile(temporaryPath, html);
	await rename(temporaryPath, catalogPath);

	report({ ok: true, captureCount: manifest.captureCount, catalogPath, catalogURL }, `Built ${manifest.captureCount} captures → ${catalogPath}`);
	return manifest;
}

async function cleanCaptures() {
	await rm(capturesRoot, { recursive: true, force: true });
	console.log(`Cleared generated captures → ${capturesRoot}`);
}

function isPathInside(candidate, root) {
	const relative = path.relative(root, candidate);
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function serveFile(response, root, relativePath) {
	const decodedPath = decodeURIComponent(relativePath);
	const candidate = path.resolve(root, `.${decodedPath}`);
	if (!isPathInside(candidate, root) || !existsSync(candidate)) {
		response.writeHead(404).end("Not found");
		return;
	}
	const info = await stat(candidate);
	if (!info.isFile()) {
		response.writeHead(404).end("Not found");
		return;
	}
	response.writeHead(200, {
		"content-type": mimeTypes.get(path.extname(candidate)) ?? "application/octet-stream",
		"content-length": info.size,
		"cache-control": "no-store",
	});
	createReadStream(candidate).pipe(response);
}

function proxyRequest(request, response) {
	const upstream = new URL(config.previewOrigin);
	const proxy = http.request(
		{
			hostname: upstream.hostname,
			port: upstream.port,
			method: request.method,
			path: request.url,
			headers: { ...request.headers, host: upstream.host },
		},
		(proxyResponse) => {
			proxyResponse.on("error", () => response.destroy());
			const headers = { ...proxyResponse.headers };
			if (typeof headers.location === "string") {
				headers.location = headers.location.replace(config.previewOrigin, "");
			}
			response.writeHead(proxyResponse.statusCode ?? 502, headers);
			proxyResponse.pipe(response);
		},
	);
	proxy.on("error", () => {
		response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
		response.end(
			`Preview is unavailable. Start the site with: npm run dev:background\nTarget: ${config.previewOrigin}`,
		);
	});
	request.pipe(proxy);
}

function sendJSON(response, status, body) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	});
	response.end(JSON.stringify(body));
}

function boundedString(value, name, maxLength, { allowEmpty = false } = {}) {
	if (typeof value !== "string") throw new Error(`${name} must be a string.`);
	const normalized = value.trim();
	if (!allowEmpty && normalized.length === 0) throw new Error(`${name} is required.`);
	if (normalized.length > maxLength) throw new Error(`${name} is too long.`);
	return normalized;
}

function boundedIdentifier(value, name) {
	const identifier = boundedString(value, name, 100);
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(identifier)) {
		throw new Error(`${name} may contain only letters, numbers, underscores, and hyphens.`);
	}
	return identifier;
}

function normalizeReviewDocument(document) {
	if (!document || typeof document !== "object" || Array.isArray(document)) {
		throw new Error("Review data must be an object.");
	}
	if (!Array.isArray(document.comments) || document.comments.length > 500) {
		throw new Error("Review data must contain 500 comments or fewer.");
	}

	const comments = document.comments.map((comment, index) => {
		if (!comment || typeof comment !== "object" || Array.isArray(comment)) {
			throw new Error(`comments[${index}] must be an object.`);
		}
		const x = Number(comment.x);
		const y = Number(comment.y);
		const source = comment.source ?? "capture";
		if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) {
			throw new Error(`comments[${index}] has an invalid position.`);
		}
		if (!["open", "resolved"].includes(comment.status)) {
			throw new Error(`comments[${index}] has an invalid status.`);
		}
		if (!["desktop", "mobile"].includes(comment.device)) {
			throw new Error(`comments[${index}] has an invalid device.`);
		}
		if (!["capture", "preview"].includes(source)) {
			throw new Error(`comments[${index}] has an invalid source.`);
		}
		const normalized = {
			id: boundedString(comment.id, `comments[${index}].id`, 100),
			...(comment.source !== undefined ? { source } : {}),
			captureId: boundedString(comment.captureId, `comments[${index}].captureId`, 240),
			pageId: boundedString(comment.pageId, `comments[${index}].pageId`, 100),
			stateId: boundedString(comment.stateId, `comments[${index}].stateId`, 100),
			project: boundedString(comment.project, `comments[${index}].project`, 100),
			device: comment.device,
			x,
			y,
			message: boundedString(comment.message, `comments[${index}].message`, 2000),
			status: comment.status,
			createdAt: boundedString(comment.createdAt, `comments[${index}].createdAt`, 64),
			updatedAt: boundedString(comment.updatedAt, `comments[${index}].updatedAt`, 64),
		};
		if (source === "preview") {
			const route = boundedString(comment.route, `comments[${index}].route`, 500);
			const viewportWidth = Number(comment.viewportWidth);
			if (!route.startsWith("/") || !Number.isInteger(viewportWidth) || viewportWidth < 320 || viewportWidth > 3000) {
				throw new Error(`comments[${index}] has invalid preview context.`);
			}
			return { ...normalized, route, viewportWidth };
		}
		return normalized;
	});

	const revision = Number(document.revision ?? 0);
	if (!Number.isInteger(revision) || revision < 0) {
		throw new Error("Review data has an invalid revision.");
	}
	const updatedAt = document.updatedAt === null || document.updatedAt === undefined
		? null
		: boundedString(document.updatedAt, "updatedAt", 64);
	return { version: 1, revision, updatedAt, comments };
}

async function readReviewDocument() {
	if (!existsSync(reviewPath)) return { version: 1, revision: 0, updatedAt: null, comments: [] };
	return normalizeReviewDocument(JSON.parse(await readFile(reviewPath, "utf8")));
}

async function readJSONBody(request, maxBytes = 1024 * 1024) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > maxBytes) throw new Error("Review data is too large.");
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

let reviewWriteQueue = Promise.resolve();

async function handleReviewAPI(request, response) {
	try {
		const origin = request.headers.origin;
		if (origin && origin !== new URL(catalogURL).origin) {
			sendJSON(response, 403, { error: "Review writes are limited to this Lenqo origin." });
			return;
		}
		if (request.method === "GET") {
			sendJSON(response, 200, await readReviewDocument());
			return;
		}
		if (request.method === "PUT") {
			const incoming = normalizeReviewDocument(await readJSONBody(request));
			const operation = reviewWriteQueue.then(async () => {
				const current = await readReviewDocument();
				if (incoming.revision !== current.revision) {
					sendJSON(response, 409, {
						error: "Reviews changed in another tab. Reload the latest comments and try again.",
						document: current,
					});
					return;
				}
				const document = {
					...incoming,
					revision: current.revision + 1,
					updatedAt: new Date().toISOString(),
				};
				await mkdir(reviewRoot, { recursive: true });
				const temporaryPath = `${reviewPath}.${process.pid}.${Date.now()}.tmp`;
				await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`);
				await rename(temporaryPath, reviewPath);
				sendJSON(response, 200, document);
			});
			reviewWriteQueue = operation.catch(() => {});
			await operation;
			return;
		}
		response.writeHead(405, { allow: "GET, PUT" }).end();
	} catch (error) {
		sendJSON(response, 400, {
			error: error instanceof Error ? error.message : "Invalid review data.",
		});
	}
}

function proxyUpgrade(request, socket, head) {
	const upstream = new URL(config.previewOrigin);
	const upstreamSocket = net.connect(Number(upstream.port || 80), upstream.hostname, () => {
		const headers = Object.entries({ ...request.headers, host: upstream.host })
			.map(([name, value]) => `${name}: ${value}`)
			.join("\r\n");
		upstreamSocket.write(
			`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers}\r\n\r\n`,
		);
		if (head.length > 0) upstreamSocket.write(head);
		socket.pipe(upstreamSocket).pipe(socket);
	});
	upstreamSocket.on("error", () => socket.destroy());
	socket.on("error", () => upstreamSocket.destroy());
}

async function serveForeground() {
	await buildCatalog();
	await mkdir(catalogRoot, { recursive: true });
	await mkdir(runtimeRoot, { recursive: true });

	const server = http.createServer(async (request, response) => {
		const requestURL = new URL(request.url ?? "/", catalogURL);
		if (requestURL.pathname === "/__lenqo/health") {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ ok: true, pid: process.pid }));
			return;
		}
		if (requestURL.pathname === "/__lenqo/api/comments") {
			await handleReviewAPI(request, response);
			return;
		}
		if (requestURL.pathname === "/catalog" || requestURL.pathname === "/catalog/") {
			await serveFile(response, catalogRoot, "/index.html");
			return;
		}
		if (requestURL.pathname.startsWith("/catalog/")) {
			await serveFile(response, catalogRoot, requestURL.pathname.slice("/catalog".length));
			return;
		}
		if (requestURL.pathname.startsWith("/captures/")) {
			await serveFile(response, capturesRoot, requestURL.pathname.slice("/captures".length));
			return;
		}
		proxyRequest(request, response);
	});
	const sockets = new Set();
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.on("error", () => sockets.delete(socket));
	});
	server.on("clientError", (_error, socket) => {
		if (!socket.destroyed) socket.destroy();
	});
	server.on("error", async (error) => {
		try {
			await unlink(pidPath);
		} catch {}
		console.error(`Lenqo could not listen on ${host}:${port}: ${error.message}`);
		process.exitCode = 1;
	});
	server.on("upgrade", proxyUpgrade);

	const shutdown = async () => {
		for (const socket of sockets) socket.destroy();
		server.close(() => process.exit());
		try {
			await unlink(pidPath);
		} catch {}
	};
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	server.listen(port, host, async () => {
		await writeFile(pidPath, String(process.pid));
		console.log(`Lenqo → ${catalogURL}`);
	});
}

async function readRunningPid() {
	if (!existsSync(pidPath)) return null;
	const pid = Number((await readFile(pidPath, "utf8")).trim());
	if (!Number.isInteger(pid)) return null;
	try {
		process.kill(pid, 0);
		return pid;
	} catch {
		return null;
	}
}

async function waitForServer(timeoutMs = 5000) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await fetch(healthURL, { signal: AbortSignal.timeout(Math.max(1, timeoutMs - (Date.now() - startedAt))) });
			if (response.ok) return await response.json();
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return null;
}

async function serveBackground() {
	const runningServer = await waitForServer(300);
	if (runningServer?.pid) {
		console.log(`Lenqo is already running (PID ${runningServer.pid}) → ${catalogURL}`);
		return;
	}

	await mkdir(runtimeRoot, { recursive: true });
	const logDescriptor = openSync(logPath, "a");
	const child = spawn(process.execPath, [
		scriptPath,
		"serve",
		"--foreground",
		"--root",
		projectRoot,
		"--config",
		configPath,
	], {
		cwd: projectRoot,
		detached: true,
		stdio: ["ignore", logDescriptor, logDescriptor],
	});
	closeSync(logDescriptor);
	child.unref();

	if (!(await waitForServer())) {
		throw new Error(`Lenqo did not start. Check ${logPath}`);
	}
	console.log(`Lenqo started (PID ${child.pid}) → ${catalogURL}`);
}

async function stopServer() {
	const runningServer = await waitForServer(300);
	const pid = runningServer?.pid ?? (await readRunningPid());
	if (!pid) {
		console.log("Lenqo is not running.");
		try {
			await unlink(pidPath);
		} catch {}
		return;
	}
	process.kill(pid, "SIGTERM");
	for (let attempt = 0; attempt < 30; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		try {
			process.kill(pid, 0);
		} catch {
			console.log(`Lenqo stopped (PID ${pid}).`);
			return;
		}
	}
	throw new Error(`Lenqo process ${pid} did not stop.`);
}

async function showStatus() {
	const runningServer = await waitForServer(300);
	if (runningServer?.pid) {
		report({ ok: true, running: true, pid: runningServer.pid, catalogURL }, `Lenqo is running (PID ${runningServer.pid}) → ${catalogURL}`);
		return;
	}
	report({ ok: false, running: false, catalogURL }, "Lenqo is not running. Check local network permissions if the server is already running.");
	process.exitCode = 1;
}

if (command === "build") {
	await buildCatalog();
} else if (command === "clean") {
	await cleanCaptures();
} else if (command === "serve") {
	if (flags.has("--background")) await serveBackground();
	else await serveForeground();
} else if (command === "stop") {
	await stopServer();
} else if (command === "status") {
	await showStatus();
} else {
	console.error(`Unknown command: ${command}`);
	process.exitCode = 1;
}
