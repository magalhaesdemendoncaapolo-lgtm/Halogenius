import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../app.js";
import { createMediaService } from "../media.js";
import { uploadVideo } from "../REACT/upload.js";

test("API validates metadata, trusts verified URL, and retains records on failed deletion", async (t) => {
	const saved = [];
	let deleted = false;
	const app = buildApp({
		logger: false,
		database: {
			create: async (video) => saved.push(video),
			list: async () => saved,
			find: async () => ({ imagekitFileId: "file-id" }),
			delete: async () => {
				deleted = true;
			},
		},
		media: {
			authorize: () => ({ token: "token" }),
			verify: async () => ({
				url: "https://ik.imagekit.io/test/video.mp4",
				mimeType: "video/mp4",
			}),
			remove: async () => {
				throw new Error("remote failure");
			},
		},
	});
	t.after(() => app.close());
	assert.equal((await app.inject("/api/health")).statusCode, 200);
	assert.equal((await app.inject("/api/missing")).statusCode, 404);
	const authorization = await app.inject({
		method: "POST",
		url: "/api/uploads/authorize",
		payload: { name: "video.mp4", size: 6000000, type: "video/mp4" },
	});
	assert.equal(authorization.statusCode, 200);
	assert.equal(authorization.headers["cache-control"], "no-store");
	assert.equal(
		(
			await app.inject({
				method: "POST",
				url: "/api/uploads/authorize",
				payload: { name: "video.mp4", size: 100000001, type: "video/mp4" },
			})
		).statusCode,
		400,
	);
	const payload = {
		title: "Video",
		description: "Test",
		duration: 8,
		fileId: "file-id",
		receipt: "receipt",
	};
	assert.equal(
		(await app.inject({ method: "POST", url: "/api/videos", payload }))
			.statusCode,
		201,
	);
	assert.equal(saved[0].videoUrl, "https://ik.imagekit.io/test/video.mp4");
	assert.equal(
		(
			await app.inject({
				method: "POST",
				url: "/api/videos",
				payload: { ...payload, receipt: undefined },
			})
		).statusCode,
		400,
	);
	assert.equal(
		(
			await app.inject({
				method: "DELETE",
				url: "/api/videos/da420afe-ee41-4ed2-8c53-05362f712c14",
			})
		).statusCode,
		500,
	);
	assert.equal(deleted, false);
});

test("signed upload receipts reject tampering, different files and expiration", async () => {
	let time = 1000;
	let file;
	const service = createMediaService({
		privateKey: "secret",
		publicKey: "public",
		now: () => time,
		client: {
			helper: {
				getAuthenticationParameters: (token, expire) => ({
					token,
					expire,
					signature: "signature",
				}),
			},
			files: {
				get: async () => file,
				delete: async () => {
					throw { status: 403 };
				},
			},
		},
	});
	const auth = service.authorize({
		name: "video.mp4",
		size: 6000000,
		type: "video/mp4",
	});
	assert.ok(!JSON.stringify(auth).includes("secret"));
	file = {
		filePath: `${auth.folder}/${auth.fileName}`,
		size: 6000000,
		mime: "video/mp4",
		url: "https://ik.imagekit.io/test/video.mp4",
	};
	assert.equal((await service.verify("file", auth.receipt)).url, file.url);
	await assert.rejects(service.verify("file", `${auth.receipt}x`), {
		statusCode: 400,
	});
	file.filePath = "/another-file.mp4";
	await assert.rejects(service.verify("file", auth.receipt), {
		statusCode: 400,
	});
	time += 86401;
	await assert.rejects(service.verify("file", auth.receipt), {
		statusCode: 400,
	});
	await assert.rejects(service.remove("file"), { statusCode: 502 });
});

test("missing ImageKit configuration fails explicitly", () => {
	const service = createMediaService({
		privateKey: "",
		publicKey: "",
		client: null,
	});
	assert.throws(() => service.authorize({ name: "v.mp4" }), {
		statusCode: 503,
	});
});

test("a video above 4.5 MB goes directly to ImageKit, not the API", async (t) => {
	const calls = [];
	t.mock.method(globalThis, "fetch", async (url, options) => {
		calls.push({ url, options });
		return Response.json(
			calls.length === 1
				? {
						publicKey: "public",
						token: "token",
						expire: 1000,
						signature: "signature",
						fileName: "video.mp4",
						folder: "/halogenius/test",
						receipt: "receipt",
					}
				: { fileId: "file-id" },
		);
	});
	const file = new File([new Uint8Array(6000000)], "video.mp4", {
		type: "video/mp4",
	});
	assert.deepEqual(await uploadVideo(file), {
		fileId: "file-id",
		receipt: "receipt",
	});
	assert.equal(calls[0].url, "/api/uploads/authorize");
	assert.ok(calls[0].options.body.length < 1000);
	assert.equal(calls[1].url, "https://upload.imagekit.io/api/v1/files/upload");
	assert.equal(calls[1].options.body.get("file").size, 6000000);
	assert.equal(calls[1].options.body.has("privateKey"), false);
});
