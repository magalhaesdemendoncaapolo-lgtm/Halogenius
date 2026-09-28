import { app } from "../runtime.js";

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const response = await app.inject({
			method: request.method,
			url: `${url.pathname}${url.search}`,
			headers: Object.fromEntries(request.headers),
			payload: ["GET", "HEAD"].includes(request.method)
				? undefined
				: await request.text(),
		});
		return new Response(
			response.statusCode === 204 || request.method === "HEAD"
				? null
				: response.body,
			{
				status: response.statusCode,
				headers: response.headers,
			},
		);
	},
};
