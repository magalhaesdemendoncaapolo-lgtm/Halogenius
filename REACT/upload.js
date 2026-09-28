export async function readResponse(response) {
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		const detail =
			typeof body?.message === "string"
				? body.message
				: "Não foi possível concluir a operação.";
		throw new Error(`${detail} (HTTP ${response.status})`);
	}
	return body;
}

export async function uploadVideo(file) {
	if (!file.type.startsWith("video/"))
		throw new Error("Selecione um arquivo de vídeo.");
	if (!file.size || file.size > 100000000)
		throw new Error("Selecione um vídeo de até 100 MB.");
	const auth = await readResponse(
		await fetch("/api/uploads/authorize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: file.name,
				size: file.size,
				type: file.type,
			}),
		}),
	);
	const payload = new FormData();
	payload.append("file", file);
	for (const field of [
		"publicKey",
		"token",
		"expire",
		"signature",
		"fileName",
		"folder",
	]) {
		payload.append(field, auth[field]);
	}
	payload.append("useUniqueFileName", "false");
	payload.append("isPrivateFile", "false");
	const uploaded = await readResponse(
		await fetch("https://upload.imagekit.io/api/v1/files/upload", {
			method: "POST",
			body: payload,
		}),
	);
	if (!uploaded?.fileId)
		throw new Error("O ImageKit não retornou o identificador do vídeo.");
	return { fileId: uploaded.fileId, receipt: auth.receipt };
}
