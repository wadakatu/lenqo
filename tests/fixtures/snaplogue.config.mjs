import { defineConfig } from "../../src/index.mjs";

export default defineConfig({
	title: "Snaplogue Fixture",
	locale: "en",
	previewOrigin: "http://127.0.0.1:4310",
	server: {
		host: "127.0.0.1",
		port: 4410,
	},
	paths: {
		captures: "test-results/fixture/captures",
		catalog: "test-results/fixture/catalog",
		reviews: "test-results/fixture/reviews.json",
		runtime: "test-results/fixture/run",
	},
	groups: [
		{
			id: "marketing",
			title: "Marketing",
			pages: [
				{ id: "home", title: "Home", route: "/", states: { default: "Default", menu: "Menu open" } },
				{ id: "about", title: "About", route: "/about/", states: { default: "Default" } },
			],
		},
	],
});
