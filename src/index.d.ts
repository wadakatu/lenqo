export type SnaplogueLocale = "en" | "ja";

export interface SnaploguePage {
	id: string;
	title: string;
	route: `/${string}`;
	states?: Record<string, string>;
}

export interface SnaplogueGroup {
	id: string;
	title: string;
	pages: SnaploguePage[];
}

export interface SnaploguePaths {
	captures?: string;
	catalog?: string;
	reviews?: string;
	runtime?: string;
}

export interface SnaplogueServerOptions {
	host?: string;
	port?: number;
	allowRemote?: boolean;
}

export interface SnaplogueConfig {
	title?: string;
	locale?: SnaplogueLocale;
	previewOrigin?: `http://${string}`;
	groups?: SnaplogueGroup[];
	/** @deprecated Prefer groups for scalable navigation. */
	pages?: SnaploguePage[];
	paths?: SnaploguePaths;
	server?: SnaplogueServerOptions;
}

export declare function defineConfig<T extends SnaplogueConfig>(config: T): T;
