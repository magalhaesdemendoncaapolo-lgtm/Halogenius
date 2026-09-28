import assert from "node:assert/strict";
import test from "node:test";

test("Vercel handler preserves API paths and JSON requests without opening a port", async (t) => {
	process.env.DATABASE_URL ||= "postgresql://test:test@localhost/test";
	const { default: handler } = await import("../api/index.js");
	const { app } = await import("../runtime.js");
	t.after(() => app.close());
	const health = await handler.fetch(
		new Request("https://halogenius.vercel.app/api/health"),
	);
	assert.equal(health.status, 200);
	assert.deepEqual(await health.json(), { status: "ok" });
	const missing = await handler.fetch(
		new Request("https://halogenius.vercel.app/api/missing"),
	);
	assert.equal(missing.status, 404);
	assert.match(missing.headers.get("content-type"), /application\/json/);
	const invalid = await handler.fetch(
		new Request("https://halogenius.vercel.app/api/videos", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		}),
	);
	assert.equal(invalid.status, 400);
});
