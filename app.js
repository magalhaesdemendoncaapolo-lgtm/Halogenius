import fastify from "fastify";

const videoProperties = {
	title: { type: "string", minLength: 1, maxLength: 255 },
	description: { type: "string", minLength: 1, maxLength: 10000 },
	duration: { type: "integer", minimum: 0 },
};
const idParams = {
	type: "object",
	required: ["id"],
	properties: { id: { type: "string", format: "uuid" } },
};
const userProperties = {
	name: { type: "string", minLength: 1, maxLength: 120 },
	role: { type: "string", enum: ["admin", "editor"] },
};

function deny(reply, status, message) {
	return reply.code(status).send({ message });
}

export function buildApp({ database, media, auth, logger = true }) {
	const app = fastify({ logger, bodyLimit: 32768 });

	async function requireRole(request, reply, roles) {
		const user = await auth.currentUser(request);
		if (!user) return deny(reply, 401, "Entre para continuar.");
		if (!roles.includes(user.role))
			return deny(reply, 403, "Você não tem permissão para esta ação.");
		request.user = user;
	}
	const requireEditor = (request, reply) =>
		requireRole(request, reply, ["admin", "editor"]);
	const requireAdmin = (request, reply) =>
		requireRole(request, reply, ["admin"]);
	const protectMutation = async (request) => auth.assertSameOrigin(request);

	app.get("/api/health", async () => ({ status: "ok" }));
	app.get("/api/auth/session", async (request, reply) => {
		reply.header("Cache-Control", "no-store");
		return { user: await auth.currentUser(request) };
	});
	app.post(
		"/api/auth/login",
		{
			preHandler: protectMutation,
			schema: {
				body: {
					type: "object",
					additionalProperties: false,
					required: ["email", "password"],
					properties: {
						email: { type: "string", format: "email", maxLength: 254 },
						password: { type: "string", minLength: 8, maxLength: 200 },
					},
				},
			},
		},
		async (request, reply) => {
			const session = await auth.login(
				request.body.email,
				request.body.password,
			);
			reply.header("Cache-Control", "no-store");
			reply.header("Set-Cookie", auth.sessionCookie(session.token));
			return { user: session.user };
		},
	);
	app.post(
		"/api/auth/logout",
		{ preHandler: protectMutation },
		async (request, reply) => {
			await auth.logout(request);
			reply.header("Set-Cookie", auth.clearCookie());
			return reply.code(204).send();
		},
	);

	app.post(
		"/api/uploads/authorize",
		{
			preHandler: [protectMutation, requireEditor],
			schema: {
				body: {
					type: "object",
					additionalProperties: false,
					required: ["name", "size", "type"],
					properties: {
						name: { type: "string", minLength: 1, maxLength: 255 },
						size: { type: "integer", minimum: 1, maximum: 100000000 },
						type: { type: "string", pattern: "^video/" },
					},
				},
			},
		},
		async (request, reply) => {
			reply.header("Cache-Control", "no-store");
			return media.authorize(request.body);
		},
	);

	app.get(
		"/api/videos",
		{
			schema: {
				querystring: {
					type: "object",
					properties: { search: { type: "string" } },
				},
			},
		},
		async (request, reply) => {
			reply.header("Cache-Control", "no-store");
			return database.list(request.query.search);
		},
	);
	app.post(
		"/api/videos",
		{
			preHandler: [protectMutation, requireEditor],
			schema: {
				body: {
					type: "object",
					additionalProperties: false,
					required: ["title", "description", "duration", "fileId", "receipt"],
					properties: {
						...videoProperties,
						fileId: { type: "string", minLength: 1, maxLength: 200 },
						receipt: { type: "string", minLength: 1, maxLength: 4096 },
					},
				},
			},
		},
		async (request, reply) => {
			const { title, description, duration, fileId, receipt } = request.body;
			if (!title.trim() || !description.trim())
				return deny(reply, 400, "Preencha título e descrição.");
			const file = await media.verify(fileId, receipt);
			await database.create({
				title: title.trim(),
				description: description.trim(),
				duration,
				videoPath: null,
				videoUrl: file.url,
				videoMimeType: file.mimeType,
				cloudinaryPublicId: null,
				imagekitFileId: fileId,
				createdBy: request.user.id,
			});
			return reply.code(201).send();
		},
	);
	app.put(
		"/api/videos/:id",
		{
			preHandler: [protectMutation, requireEditor],
			schema: {
				params: idParams,
				body: {
					type: "object",
					additionalProperties: false,
					required: ["title", "description", "duration"],
					properties: videoProperties,
				},
			},
		},
		async (request, reply) => {
			if (!request.body.title.trim() || !request.body.description.trim()) {
				return deny(reply, 400, "Preencha título e descrição.");
			}
			if (!(await database.update(request.params.id, request.body)))
				return deny(reply, 404, "Vídeo não encontrado.");
			return reply.code(204).send();
		},
	);
	app.delete(
		"/api/videos/:id",
		{
			preHandler: [protectMutation, requireEditor],
			schema: { params: idParams },
		},
		async (request, reply) => {
			const video = await database.find(request.params.id);
			if (!video) return deny(reply, 404, "Vídeo não encontrado.");
			if (video.imagekitFileId) await media.remove(video.imagekitFileId);
			await database.delete(request.params.id);
			return reply.code(204).send();
		},
	);

	app.get(
		"/api/users",
		{ preHandler: requireAdmin },
		async (_request, reply) => {
			reply.header("Cache-Control", "no-store");
			return database.listUsers();
		},
	);
	app.post(
		"/api/users",
		{
			preHandler: [protectMutation, requireAdmin],
			schema: {
				body: {
					type: "object",
					additionalProperties: false,
					required: ["name", "email", "password", "role"],
					properties: {
						...userProperties,
						email: { type: "string", format: "email", maxLength: 254 },
						password: { type: "string", minLength: 10, maxLength: 200 },
					},
				},
			},
		},
		async (request, reply) => {
			const name = request.body.name.trim();
			if (!name) return deny(reply, 400, "Informe o nome do usuário.");
			const user = await database.createUser({
				name,
				email: request.body.email.trim().toLowerCase(),
				passwordHash: await auth.hashPassword(request.body.password),
				role: request.body.role,
			});
			return reply.code(201).send(user);
		},
	);
	app.patch(
		"/api/users/:id",
		{
			preHandler: [protectMutation, requireAdmin],
			schema: {
				params: idParams,
				body: {
					type: "object",
					additionalProperties: false,
					required: ["name", "role", "active"],
					properties: { ...userProperties, active: { type: "boolean" } },
				},
			},
		},
		async (request, reply) => {
			const name = request.body.name.trim();
			if (!name) return deny(reply, 400, "Informe o nome do usuário.");
			const target = await database.findUser(request.params.id);
			if (!target) return deny(reply, 404, "Usuário não encontrado.");
			if (
				request.params.id === request.user.id &&
				(!request.body.active || request.body.role !== "admin")
			) {
				return deny(
					reply,
					400,
					"Você não pode remover sua própria permissão de administrador.",
				);
			}
			if (
				target.active &&
				target.role === "admin" &&
				(!request.body.active || request.body.role !== "admin") &&
				(await database.countActiveAdmins()) <= 1
			) {
				return deny(reply, 400, "Mantenha pelo menos um administrador ativo.");
			}
			const user = await database.updateUser(request.params.id, {
				name,
				role: request.body.role,
				active: request.body.active,
			});
			return user || deny(reply, 404, "Usuário não encontrado.");
		},
	);
	app.put(
		"/api/users/:id/password",
		{
			preHandler: [protectMutation, requireAdmin],
			schema: {
				params: idParams,
				body: {
					type: "object",
					additionalProperties: false,
					required: ["password"],
					properties: {
						password: { type: "string", minLength: 10, maxLength: 200 },
					},
				},
			},
		},
		async (request, reply) => {
			const updated = await database.updateUserPassword(
				request.params.id,
				await auth.hashPassword(request.body.password),
			);
			if (!updated) return deny(reply, 404, "Usuário não encontrado.");
			return reply.code(204).send();
		},
	);

	app.setErrorHandler((error, request, reply) => {
		request.log.error(
			{ code: error.code, status: error.statusCode },
			"Falha na API",
		);
		if (error.code === "23505")
			return deny(reply, 409, "Este e-mail já está cadastrado.");
		if (error.validation)
			return deny(reply, 400, "Dados inválidos. Confira os campos informados.");
		const status =
			error.statusCode >= 400 && error.statusCode < 600
				? error.statusCode
				: 500;
		return deny(
			reply,
			status,
			error.publicMessage ||
				"Não foi possível concluir a operação. Tente novamente.",
		);
	});
	return app;
}
