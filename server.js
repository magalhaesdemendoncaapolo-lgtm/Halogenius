import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import multipart from "@fastify/multipart";
import fastify from "fastify";
import { DatabasePostgres } from "./db_postgres.js";
import { host, port } from "./server_host.js";

const server = fastify({ logger: true });
const database = new DatabasePostgres();
const uploadsDirectory = join(
	dirname(fileURLToPath(import.meta.url)),
	"uploads",
);
const maxVideoSize = 100 * 1024 * 1024;

await mkdir(uploadsDirectory, { recursive: true });

await server.register(multipart, {
	limits: { files: 1, fileSize: maxVideoSize },
});

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

server.post("/videos", async (request, reply) => {
	if (!request.isMultipart()) {
		return reply.status(415).send({
			message: "Envie os dados do vídeo usando formulário multipart.",
		});
	}

	const fields = {};
	let uploadedFile;

	for await (const part of request.parts()) {
		if (part.type === "file") {
			if (uploadedFile) {
				part.file.resume();
				continue;
			}

			if (!part.mimetype.startsWith("video/")) {
				part.file.resume();
				return reply
					.status(400)
					.send({ message: "Selecione um arquivo de vídeo válido." });
			}

			const extension = extname(part.filename).toLowerCase() || ".mp4";
			const filename = `${randomUUID()}${extension}`;
			const destination = join(uploadsDirectory, filename);

			try {
				await pipeline(part.file, createWriteStream(destination));
			} catch (error) {
				await unlink(destination).catch(() => {});
				throw error;
			}

			uploadedFile = {
				filename,
				destination,
				mimetype: part.mimetype,
				truncated: part.file.truncated,
			};
		} else {
			fields[part.fieldname] = part.value;
		}
	}

	const title = fields.title?.trim();
	const description = fields.description?.trim();
	const duration = Number(fields.duration);

	if (!title || !description || !Number.isInteger(duration) || duration < 0) {
		if (uploadedFile) await unlink(uploadedFile.destination).catch(() => {});
		return reply.status(400).send({ message: "Dados do vídeo inválidos." });
	}

	if (!uploadedFile) {
		return reply
			.status(400)
			.send({ message: "Selecione um arquivo de vídeo válido." });
	}

	if (uploadedFile.truncated) {
		await unlink(uploadedFile.destination).catch(() => {});
		return reply
			.status(413)
			.send({ message: "O vídeo ultrapassa o limite de 100 MB." });
	}

	try {
		await database.create({
			title,
			description,
			duration,
			videoPath: `/uploads/${uploadedFile.filename}`,
			videoMimeType: uploadedFile.mimetype,
		});
	} catch (error) {
		await unlink(uploadedFile.destination).catch(() => {});
		throw error;
	}

	return reply.status(201).send();
});

server.get("/uploads/:filename", async (request, reply) => {
	const filename = basename(request.params.filename);
	if (filename !== request.params.filename) {
		return reply.status(400).send({ message: "Nome de arquivo inválido." });
	}

	const extension = extname(filename).toLowerCase();
	const mimeTypes = {
		".mp4": "video/mp4",
		".webm": "video/webm",
		".ogg": "video/ogg",
		".mov": "video/quicktime",
	};
	const filePath = join(uploadsDirectory, filename);
	let fileStats;

	try {
		fileStats = await stat(filePath);
	} catch (error) {
		if (error.code === "ENOENT") {
			return reply.status(404).send({ message: "Arquivo não encontrado." });
		}
		throw error;
	}

	const range = request.headers.range;
	const contentType = mimeTypes[extension] || "application/octet-stream";

	if (!range) {
		return reply
			.header("Accept-Ranges", "bytes")
			.header("Content-Length", fileStats.size)
			.type(contentType)
			.send(createReadStream(filePath));
	}

	const match = /^bytes=(\d*)-(\d*)$/.exec(range);
	if (!match) {
		return reply
			.status(416)
			.header("Content-Range", `bytes */${fileStats.size}`)
			.send();
	}

	const [, startValue, endValue] = match;
	let start;
	let end;

	if (startValue === "") {
		const suffixLength = Number(endValue);
		start = Math.max(fileStats.size - suffixLength, 0);
		end = fileStats.size - 1;
	} else {
		start = Number(startValue);
		end = endValue
			? Math.min(Number(endValue), fileStats.size - 1)
			: fileStats.size - 1;
	}

	if (
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		start < 0 ||
		start > end ||
		start >= fileStats.size
	) {
		return reply
			.status(416)
			.header("Content-Range", `bytes */${fileStats.size}`)
			.send();
	}

	return reply
		.status(206)
		.header("Accept-Ranges", "bytes")
		.header("Content-Length", end - start + 1)
		.header("Content-Range", `bytes ${start}-${end}/${fileStats.size}`)
		.type(contentType)
		.send(createReadStream(filePath, { start, end }));
});

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

		if (deleted.videoPath) {
			const filename = basename(deleted.videoPath);
			await unlink(join(uploadsDirectory, filename)).catch((error) => {
				if (error.code !== "ENOENT") throw error;
			});
		}

		return reply.status(204).send();
	},
);

server.setErrorHandler((error, _request, reply) => {
	if (error.code === "FST_REQ_FILE_TOO_LARGE") {
		return reply
			.status(413)
			.send({ message: "O vídeo ultrapassa o limite de 100 MB." });
	}

	server.log.error(error);
	return reply
		.status(500)
		.send({ message: "Não foi possível processar o vídeo." });
});

await server.listen({
	port,
	host,
});
