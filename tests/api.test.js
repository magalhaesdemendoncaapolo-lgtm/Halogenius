import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../app.js";
import { createAuthService, hashPassword, verifyPassword } from "../auth.js";
import { createMediaService } from "../media.js";
import { uploadVideo } from "../REACT/upload.js";

function fakeAuth() {
	return {
		currentUser: async (request) =>
			request.headers["x-test-role"]
				? {
						id: "3f84779a-799d-4c33-ae0c-809e8466a59e",
						name: "Test",
						email: "test@example.com",
						role: request.headers["x-test-role"],
					}
				: null,
		assertSameOrigin() {},
		hashPassword: async () => "hash",
		login: async () => ({ token: "token", user: { role: "editor" } }),
		logout: async () => {},
		sessionCookie: () => "session=token",
		clearCookie: () => "session=",
	};
}

function buildTestApp(overrides = {}) {
	const saved = [];
	let deleted = false;
	const database = {
		create: async (video) => saved.push(video),
		list: async () => saved,
		find: async () => ({ imagekitFileId: "file-id" }),
		delete: async () => {
			deleted = true;
		},
		listUsers: async () => [],
		findUser: async () => ({
			id: "user",
			name: "User",
			role: "editor",
			active: true,
		}),
		createUser: async (user) => ({ id: "user", ...user, active: true }),
		countActiveAdmins: async () => 1,
		updateUser: async (_id, user) => user,
		updateUserPassword: async () => true,
		...overrides.database,
	};
	const media = {
		authorize: () => ({ token: "token" }),
		verify: async () => ({
			url: "https://ik.imagekit.io/test/video.mp4",
			mimeType: "video/mp4",
		}),
		remove: async () => {},
		...overrides.media,
	};
	return {
		app: buildApp({ logger: false, database, media, auth: fakeAuth() }),
		saved,
		deleted: () => deleted,
	};
}

test("public listing remains open while every video mutation requires an editor", async (t) => {
	const { app, saved } = buildTestApp();
	t.after(() => app.close());
	assert.equal((await app.inject("/api/health")).statusCode, 200);
	assert.equal((await app.inject("/api/videos")).statusCode, 200);
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
		401,
	);
	assert.equal(
		(
			await app.inject({
				method: "POST",
				url: "/api/videos",
				headers: { "x-test-role": "editor" },
				payload,
			})
		).statusCode,
		201,
	);
	assert.equal(saved[0].createdBy, "3f84779a-799d-4c33-ae0c-809e8466a59e");
	assert.equal(
		(
			await app.inject({
				method: "POST",
				url: "/api/uploads/authorize",
				payload: { name: "video.mp4", size: 6000000, type: "video/mp4" },
			})
		).statusCode,
		401,
	);
	assert.equal(
		(
			await app.inject({
				method: "POST",
				url: "/api/uploads/authorize",
				headers: { "x-test-role": "editor" },
				payload: { name: "video.mp4", size: 6000000, type: "video/mp4" },
			})
		).statusCode,
		200,
	);
});

test("only administrators can manage users", async (t) => {
	const { app } = buildTestApp();
	t.after(() => app.close());
	assert.equal((await app.inject("/api/users")).statusCode, 401);
	assert.equal(
		(
			await app.inject({
				url: "/api/users",
				headers: { "x-test-role": "editor" },
			})
		).statusCode,
		403,
	);
	assert.equal(
		(
			await app.inject({
				url: "/api/users",
				headers: { "x-test-role": "admin" },
			})
		).statusCode,
		200,
	);
	const response = await app.inject({
		method: "POST",
		url: "/api/users",
		headers: { "x-test-role": "admin" },
		payload: {
			name: "Editor",
			email: "editor@example.com",
			password: "password-123",
			role: "editor",
		},
	});
	assert.equal(response.statusCode, 201);
});

test("passwords are hashed and session cookies use browser protections", async () => {
	const passwordHash = await hashPassword("correct-horse-battery");
	assert.equal(
		await verifyPassword("correct-horse-battery", passwordHash),
		true,
	);
	assert.equal(await verifyPassword("wrong-password", passwordHash), false);
	const service = createAuthService({ database: {}, production: true });
	const cookie = service.sessionCookie("secret-token");
	assert.match(cookie, /^__Host-halogenius_session=/);
	assert.match(cookie, /HttpOnly/);
	assert.match(cookie, /Secure/);
	assert.match(cookie, /SameSite=Strict/);
	assert.throws(
		() =>
			service.assertSameOrigin({
				protocol: "https",
				headers: {
					host: "halogenius.vercel.app",
					origin: "https://evil.example",
				},
			}),
		{ statusCode: 403 },
	);
});

test("login creates a hashed server-side session and logout invalidates it", async () => {
	const passwordHash = await hashPassword("correct-horse-battery");
	let storedTokenHash;
	let deletedTokenHash;
	let failures = 0;
	const database = {
		findAuthUserByEmail: async () => ({
			id: "user-id",
			name: "Editor",
			email: "editor@example.com",
			passwordHash,
			role: "editor",
			active: true,
			lockedUntil: null,
		}),
		createAuthSession: async (_id, tokenHash) => {
			storedTokenHash = tokenHash;
		},
		findAuthSession: async (tokenHash) =>
			tokenHash === storedTokenHash ? { id: "user-id", role: "editor" } : null,
		deleteAuthSession: async (tokenHash) => {
			deletedTokenHash = tokenHash;
		},
		recordFailedLogin: async () => {
			failures += 1;
		},
		resetFailedLogin: async () => {},
	};
	const service = createAuthService({ database, production: true });
	const session = await service.login(
		"EDITOR@example.com",
		"correct-horse-battery",
	);
	assert.equal(storedTokenHash.length, 64);
	assert.ok(!service.sessionCookie(session.token).includes(storedTokenHash));
	const user = await service.currentUser({
		headers: { cookie: service.sessionCookie(session.token).split(";")[0] },
	});
	assert.equal(user.role, "editor");
	await service.logout({
		headers: { cookie: service.sessionCookie(session.token).split(";")[0] },
	});
	assert.equal(deletedTokenHash, storedTokenHash);
	await assert.rejects(
		service.login("editor@example.com", "incorrect-password"),
		{ statusCode: 401 },
	);
	assert.equal(failures, 1);
});

test("the last active administrator cannot be demoted", async (t) => {
	const adminId = "c86e5421-758a-499a-b335-bcd38fae7346";
	const { app } = buildTestApp({
		database: {
			findUser: async () => ({ id: adminId, role: "admin", active: true }),
			countActiveAdmins: async () => 1,
		},
	});
	t.after(() => app.close());
	const response = await app.inject({
		method: "PATCH",
		url: `/api/users/${adminId}`,
		headers: { "x-test-role": "admin" },
		payload: { name: "Admin", role: "editor", active: true },
	});
	assert.equal(response.statusCode, 400);
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
});

test("a video above 4.5 MB goes directly to ImageKit", async (t) => {
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
});
