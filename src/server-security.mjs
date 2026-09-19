// Exact authorities only: never accept arbitrary DNS names just because the
// listener is bound to loopback. Apply this before HTTP routing AND upgrades.
export function normalizeAllowedHost(value) {
	if (typeof value !== "string" || !/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)$/i.test(value)) {
		throw new Error("server.allowedHosts must contain exact hostnames/IPs without ports or wildcards.");
	}
	return new URL(`http://${value}`).hostname.toLowerCase();
}

export function requestAllowed(request, { host, port, allowedHosts = [] }) {
	const authority = request.headers.host;
	if (typeof authority !== "string" || !/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d+)?$/i.test(authority)) return false;
	try {
		const url = new URL(`http://${authority}`);
		const hosts = new Set(["localhost", "127.0.0.1", "[::1]", host === "::1" ? "[::1]" : host, ...allowedHosts].map(value => value.toLowerCase()));
		if (Number(url.port || 80) !== port || !hosts.has(url.hostname.toLowerCase())) return false;
		if (request.headers["sec-fetch-site"] === "cross-site") return false;
		// Browser same-origin GETs and CLI requests may omit Origin. Host checking
		// remains mandatory; a present Origin must match this exact authority.
		if (request.headers.origin !== undefined && request.headers.origin !== url.origin) return false;
		return true;
	} catch { return false; }
}
