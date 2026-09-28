import "dotenv/config";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { extname } from "node:path";
import ImageKit from "@imagekit/nodejs";

function failure(message, statusCode = 502) {
	return Object.assign(new Error(message), {
		publicMessage: message,
		statusCode,
	});
}

export function createMediaService({
	privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim(),
	publicKey = process.env.IMAGEKIT_PUBLIC_KEY?.trim(),
	client = privateKey
		? new ImageKit({ privateKey, maxRetries: 0, timeout: 20000 })
		: null,
	now = () => Math.floor(Date.now() / 1000),
} = {}) {
	function configured() {
		if (!client || !privateKey || !publicKey) {
			throw failure(
				"Configure IMAGEKIT_PRIVATE_KEY e IMAGEKIT_PUBLIC_KEY na API da Vercel.",
				503,
			);
		}
	}
	function sign(value) {
		return createHmac("sha256", privateKey)
			.update(`halogenius-upload:${value}`)
			.digest("hex");
	}
	async function remote(operation) {
		try {
			return await operation();
		} catch (error) {
			if (error.status === 401 || error.status === 403) {
				throw failure(
					"O ImageKit recusou a autenticação. Confira as chaves configuradas na Vercel.",
					502,
				);
			}
			if (error.status === 404)
				throw failure("O arquivo não foi encontrado no ImageKit.", 404);
			throw failure("Não foi possível acessar o ImageKit. Tente novamente.");
		}
	}
	return {
		authorize({ name, size, type }) {
			configured();
			const token = randomUUID();
			const extension = extname(name).toLowerCase();
			const fileName = `video${/^\.[a-z0-9]{1,10}$/.test(extension) ? extension : ".mp4"}`;
			const folder = `/halogenius/${token}`;
			const payload = Buffer.from(
				JSON.stringify({
					path: `${folder}/${fileName}`,
					size,
					type,
					expires: now() + 86400,
				}),
			).toString("base64url");
			return {
				...client.helper.getAuthenticationParameters(token, now() + 1800),
				publicKey,
				fileName,
				folder,
				receipt: `${payload}.${sign(payload)}`,
			};
		},
		async verify(fileId, receipt) {
			configured();
			const [payload, signature, extra] = receipt.split(".");
			const expected = sign(payload || "");
			if (
				extra ||
				!/^[a-f0-9]{64}$/.test(signature || "") ||
				!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
			) {
				throw failure(
					"Autorização de upload inválida. Selecione o vídeo novamente.",
					400,
				);
			}
			let authorization;
			try {
				authorization = JSON.parse(
					Buffer.from(payload, "base64url").toString(),
				);
			} catch {
				throw failure("Autorização de upload inválida.", 400);
			}
			if (authorization.expires < now())
				throw failure("Upload expirado. Selecione o vídeo novamente.", 400);
			const file = await remote(() => client.files.get(fileId));
			if (
				file.filePath !== authorization.path ||
				file.size !== authorization.size ||
				file.size > 100000000 ||
				!file.mime?.startsWith("video/") ||
				file.isPrivateFile ||
				!file.url?.startsWith("https://")
			) {
				throw failure(
					"O arquivo enviado não corresponde ao vídeo autorizado.",
					400,
				);
			}
			return { url: file.url, mimeType: file.mime };
		},
		async remove(fileId) {
			configured();
			try {
				await remote(() => client.files.delete(fileId));
			} catch (error) {
				if (error.statusCode !== 404) throw error;
			}
		},
	};
}
