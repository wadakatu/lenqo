import http from "node:http";

const pages = {
	"/": {
		title: "Fixture home",
		body: "A quiet place to review a product before it ships.",
	},
	"/about/": {
		title: "About the fixture",
		body: "This second page proves that catalog and preview navigation stay in sync.",
	},
};

const server = http.createServer((request, response) => {
	const url = new URL(request.url ?? "/", "http://127.0.0.1:4310");
	const page = pages[url.pathname];
	if (!page) {
		response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
		return;
	}
	response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
	response.end(`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>${page.title}</title>
		<style>
			* { box-sizing: border-box; }
			body { margin: 0; background: #faf7ef; color: #202826; font: 18px/1.6 system-ui, sans-serif; }
			header { display: flex; justify-content: space-between; padding: 24px clamp(24px, 6vw, 90px); border-bottom: 1px solid #aab2ae; }
			nav { display: flex; gap: 20px; }
			a { color: inherit; }
			main { min-height: 1100px; padding: 14vh clamp(24px, 9vw, 140px); }
			h1 { max-width: 800px; margin: 0; font: 600 clamp(48px, 8vw, 108px)/0.95 Georgia, serif; letter-spacing: -0.06em; }
			p { max-width: 560px; margin-top: 36px; }
		</style>
	</head>
	<body>
		<header><strong>Fixture</strong><nav><a href="/">Home</a><a href="/about/">About</a></nav></header>
		<main><h1>${page.title}</h1><p>${page.body}</p></main>
	</body>
</html>`);
});

server.listen(4310, "127.0.0.1", () => console.log("Fixture → http://127.0.0.1:4310"));

const shutdown = () => server.close(() => process.exit());
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
