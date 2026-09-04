import { defineConfig } from "snaplogue";

export default defineConfig({
	title: "Basic example",
	previewOrigin: "http://127.0.0.1:3000",
	groups: [
		{
			id: "website",
			title: "Website",
			pages: [
				{ id: "home", title: "Home", route: "/", states: { default: "Default" } },
			],
		},
	],
});
