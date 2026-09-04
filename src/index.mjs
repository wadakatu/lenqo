/**
 * Provides editor inference while leaving the configuration unchanged at runtime.
 *
 * @template {import("./index.d.ts").SnaplogueConfig} T
 * @param {T} config
 * @returns {T}
 */
export function defineConfig(config) {
	return config;
}
