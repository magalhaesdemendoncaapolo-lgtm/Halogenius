import fastify from "fastify";
import { DatabasePostgres } from "./db_postgres.js";
import { host, port } from "./server_host.js";

const server = fastify({ logger: true });
const database = new DatabasePostgres();

const videoSchema = {
	type: "object",
	required: ["title", "description", "duration"],
	additionalProperties: false,
	properties: {
		title: { type: "string", minLength: 1, maxLength: 255 },
		description: { type: "string", minLength: 1 },
		duration: { type: "integer", minimum: 0 },
	},
};

const videoParamsSchema = {
	type: "object",
	required: ["id"],
	properties: { id: { type: "string", format: "uuid" } },
};

server.post(
	"/videos",
	{ schema: { body: videoSchema } },
	async (request, reply) => {
		const { title, description, duration } = request.body;

		await database.create({
			title,
			description,
			duration,
		});

		return reply.status(201).send();
	},
);

server.get(
	"/videos",
	{
		schema: {
			querystring: {
				type: "object",
				properties: { search: { type: "string" } },
			},
		},
	},
	async (request) => {
		const { search } = request.query;

		const videos = await database.list(search);

		return videos;
	},
);

server.put(
	"/videos/:id",
	{
		schema: { params: videoParamsSchema, body: videoSchema },
	},
	async (request, reply) => {
		const videoId = request.params.id;
		const { title, description, duration } = request.body;

		const updated = await database.update(videoId, {
			title,
			description,
			duration,
		});

		if (!updated) {
			return reply.status(404).send({ message: "Video not found" });
		}

		return reply.status(204).send();
	},
);

server.delete(
	"/videos/:id",
	{
		schema: { params: videoParamsSchema },
	},
	async (request, reply) => {
		const videoId = request.params.id;

		const deleted = await database.delete(videoId);

		if (!deleted) {
			return reply.status(404).send({ message: "Video not found" });
		}

		return reply.status(204).send();
	},
);

await server.listen({
	port,
	host,
});
