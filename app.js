import fastify from "fastify";

const videoProperties = {
	title: { type: "string", minLength: 1, maxLength: 255 },
	description: { type: "string", minLength: 1, maxLength: 10000 },
	duration: { type: "integer", minimum: 0 },
};
const params = {
	type: "object",
	required: ["id"],
	properties: { id: { type: "string", format: "uuid" } },
};

export function buildApp({ database, media, logger = true }) {
	const app = fastify({ logger, bodyLimit: 32768 });
	app.get("/api/health", async () => ({ status: "ok" }));
	app.post(
		"/api/uploads/authorize",
		{
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
			if (!title.trim() || !description.trim()) {
				return reply
					.code(400)
					.send({ message: "Preencha título e descrição." });
			}
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
			});
			return reply.code(201).send();
		},
	);
	app.put(
		"/api/videos/:id",
		{
			schema: {
				params,
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
				return reply
					.code(400)
					.send({ message: "Preencha título e descrição." });
			}
			if (!(await database.update(request.params.id, request.body))) {
				return reply.code(404).send({ message: "Vídeo não encontrado." });
			}
			return reply.code(204).send();
		},
	);
	app.delete(
		"/api/videos/:id",
		{ schema: { params } },
		async (request, reply) => {
			const video = await database.find(request.params.id);
			if (!video)
				return reply.code(404).send({ message: "Vídeo não encontrado." });
			// Preserve the record when remote deletion fails, so it can be retried.
			if (video.imagekitFileId) await media.remove(video.imagekitFileId);
			await database.delete(request.params.id);
			return reply.code(204).send();
		},
	);
	app.setErrorHandler((error, request, reply) => {
		request.log.error(
			{ code: error.code, status: error.statusCode },
			"Falha na API",
		);
		if (error.validation)
			return reply.code(400).send({
				message:
					"Dados inválidos. Use um vídeo de até 100 MB e preencha os campos.",
			});
		const status =
			error.statusCode >= 400 && error.statusCode < 600
				? error.statusCode
				: 500;
		return reply.code(status).send({
			message:
				error.publicMessage ||
				(status === 415
					? "Envie o arquivo ao ImageKit antes de salvar os dados do vídeo."
					: "Não foi possível concluir a operação. Tente novamente."),
		});
	});
	return app;
}
