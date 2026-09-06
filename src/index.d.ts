export type LenqoLocale = "en" | "ja";

export interface LenqoPage {
	id: string;
	title: string;
	route: `/${string}`;
	states?: Record<string, string>;
}

export interface LenqoGroup {
	id: string;
	title: string;
	pages: LenqoPage[];
}

export interface LenqoPaths {
	captures?: string;
	catalog?: string;
	reviews?: string;
	runtime?: string;
}

export interface LenqoServerOptions {
	host?: string;
	port?: number;
	allowRemote?: boolean;
}

export interface LenqoConfig {
	title?: string;
	locale?: LenqoLocale;
	previewOrigin?: `http://${string}`;
	groups?: LenqoGroup[];
	/** @deprecated Prefer groups for scalable navigation. */
	pages?: LenqoPage[];
	paths?: LenqoPaths;
	server?: LenqoServerOptions;
}

export declare function defineConfig<T extends LenqoConfig>(config: T): T;
