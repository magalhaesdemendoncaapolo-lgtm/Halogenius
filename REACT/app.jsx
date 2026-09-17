import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const emptyVideo = { title: "", description: "", duration: "" };
const API_URL = "/api/videos";

function formatDuration(seconds) {
	const value = Number(seconds);
	const minutes = Math.floor(value / 60);
	const remainingSeconds = value % 60;

	return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getVideoIdFromPath(pathname) {
	const match = pathname.match(/^\/videos\/([0-9a-f-]+)$/i);
	return match?.[1] || null;
}

export default function App() {
	const [videos, setVideos] = useState([]);
	const [search, setSearch] = useState("");
	const [form, setForm] = useState(emptyVideo);
	const [videoFile, setVideoFile] = useState(null);
	const [fileInputKey, setFileInputKey] = useState(0);
	const [editingId, setEditingId] = useState(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [message, setMessage] = useState(null);
	const [shareMessage, setShareMessage] = useState(null);
	const [pathname, setPathname] = useState(() => window.location.pathname);
	const playerRef = useRef(null);
	const openedVideoId = useMemo(() => getVideoIdFromPath(pathname), [pathname]);
	const openedVideo = videos.find((video) => video.id === openedVideoId);

	const pageTitle = useMemo(
		() => (editingId ? "Editar vídeo" : "Adicionar vídeo"),
		[editingId],
	);

	const loadVideos = useCallback(async (term = "") => {
		setLoading(true);
		try {
			const url = term
				? `${API_URL}?search=${encodeURIComponent(term)}`
				: API_URL;
			const response = await fetch(url);
			if (!response.ok) throw new Error("Não foi possível carregar os vídeos.");
			setVideos(await response.json());
		} catch (error) {
			setMessage({ type: "error", text: error.message });
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => loadVideos(search), 300);
		return () => clearTimeout(timer);
	}, [search, loadVideos]);

	useEffect(() => {
		function syncPathname() {
			setPathname(window.location.pathname);
		}

		window.addEventListener("popstate", syncPathname);
		return () => window.removeEventListener("popstate", syncPathname);
	}, []);

	function navigateTo(path) {
		window.history.pushState({}, "", path);
		setPathname(path);
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	function skipVideo(seconds) {
		const player = playerRef.current;
		if (!player) return;

		const limit = Number.isFinite(player.duration)
			? player.duration
			: Number.POSITIVE_INFINITY;
		player.currentTime = Math.max(
			0,
			Math.min(player.currentTime + seconds, limit),
		);
	}

	function enableAudio(event) {
		const player = event.currentTarget;
		player.defaultMuted = false;
		player.muted = false;
		player.volume = 1;
	}

	async function shareVideo(video) {
		const shareData = {
			title: video.title,
			text: `Assista a ${video.title} no Halogenius.`,
			url: window.location.href,
		};

		try {
			if (navigator.share) {
				await navigator.share(shareData);
				setShareMessage({
					type: "success",
					text: "Opções de compartilhamento abertas.",
				});
				return;
			}

			await navigator.clipboard.writeText(shareData.url);
			setShareMessage({
				type: "success",
				text: "Link copiado para a área de transferência.",
			});
		} catch (error) {
			if (error.name === "AbortError") return;
			setShareMessage({
				type: "error",
				text: "Não foi possível compartilhar o link.",
			});
		}
	}

	function updateField(event) {
		const { name, value } = event.target;
		setForm((current) => ({ ...current, [name]: value }));
	}

	function resetForm() {
		setForm(emptyVideo);
		setVideoFile(null);
		setFileInputKey((current) => current + 1);
		setEditingId(null);
	}

	function selectVideoFile(event) {
		const [file] = event.target.files;
		setVideoFile(file || null);

		if (!file) return;

		const video = document.createElement("video");
		const url = URL.createObjectURL(file);
		video.preload = "metadata";
		video.onloadedmetadata = () => {
			setForm((current) => ({
				...current,
				duration: String(Math.round(video.duration)),
			}));
			URL.revokeObjectURL(url);
		};
		video.onerror = () => URL.revokeObjectURL(url);
		video.src = url;
	}

	async function submitForm(event) {
		event.preventDefault();
		setSubmitting(true);
		setMessage(null);

		const isEditing = Boolean(editingId);
		let options;

		if (isEditing) {
			options = {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...form, duration: Number(form.duration) }),
			};
		} else {
			if (!videoFile) {
				setMessage({ type: "error", text: "Selecione um arquivo de vídeo." });
				setSubmitting(false);
				return;
			}

			const payload = new FormData();
			payload.append("title", form.title);
			payload.append("description", form.description);
			payload.append("duration", form.duration);
			payload.append("video", videoFile);
			options = { method: "POST", body: payload };
		}

		try {
			const response = await fetch(
				isEditing ? `${API_URL}/${editingId}` : API_URL,
				options,
			);

			if (!response.ok) throw new Error("Não foi possível salvar o vídeo.");

			resetForm();
			setMessage({
				type: "success",
				text: isEditing ? "Vídeo atualizado." : "Vídeo adicionado.",
			});
			await loadVideos(search);
		} catch (error) {
			setMessage({ type: "error", text: error.message });
		} finally {
			setSubmitting(false);
		}
	}

	function editVideo(video) {
		setForm({
			title: video.title,
			description: video.description,
			duration: String(video.duration),
		});
		setVideoFile(null);
		setFileInputKey((current) => current + 1);
		setEditingId(video.id);
		setMessage(null);
	}

	async function removeVideo(video) {
		if (!window.confirm(`Excluir “${video.title}”?`)) return;

		try {
			const response = await fetch(`${API_URL}/${video.id}`, {
				method: "DELETE",
			});
			if (!response.ok) throw new Error("Não foi possível excluir o vídeo.");
			if (editingId === video.id) resetForm();
			setMessage({ type: "success", text: "Vídeo excluído." });
			await loadVideos(search);
		} catch (error) {
			setMessage({ type: "error", text: error.message });
		}
	}

	if (openedVideoId) {
		return (
			<main className="page-shell">
				<button
					className="link-button back-button"
					type="button"
					onClick={() => navigateTo("/")}
				>
					← Voltar para a biblioteca
				</button>

				{loading ? (
					<p className="state">Carregando vídeo…</p>
				) : !openedVideo ? (
					<section className="player-page">
						<h1>Vídeo não encontrado</h1>
						<p>Este vídeo não existe ou foi excluído.</p>
					</section>
				) : (
					<section className="player-page">
						<div className="player-heading">
							<h1>{openedVideo.title}</h1>
							<button
								className="share-button"
								type="button"
								onClick={() => shareVideo(openedVideo)}
							>
								Compartilhar
							</button>
						</div>
						{shareMessage && (
							<p className={`notice ${shareMessage.type}`}>
								{shareMessage.text}
							</p>
						)}
						{openedVideo.videoPath ? (
							<div className="video-player">
								<video
									ref={playerRef}
									controls
									onLoadedMetadata={enableAudio}
									preload="metadata"
									src={openedVideo.videoPath}
								>
									<track
										default
										kind="captions"
										label="Legendas em português"
										src="data:text/vtt,WEBVTT"
										srcLang="pt-BR"
									/>
									Seu navegador não suporta a reprodução de vídeo.
								</video>
								<div className="player-controls">
									<button
										type="button"
										onClick={() => skipVideo(-10)}
										aria-label="Voltar 10 segundos"
									>
										↶ 10s
									</button>
									<button
										type="button"
										onClick={() => skipVideo(10)}
										aria-label="Avançar 10 segundos"
									>
										10s ↷
									</button>
								</div>
							</div>
						) : (
							<p>
								Este registro foi criado antes do recurso de upload de vídeos.
							</p>
						)}
						<p className="video-description">{openedVideo.description}</p>
						<p className="video-meta">
							Duração: {formatDuration(openedVideo.duration)}
						</p>
					</section>
				)}
			</main>
		);
	}

	return (
		<main className="page-shell">
			<header className="hero">
				<p className="eyebrow">LUGENIUS</p>
				<h1>Biblioteca de vídeos</h1>
				<p>Organize os seus conteúdos em um só lugar.</p>
			</header>

			<section className="workspace" aria-label="Gerenciamento de vídeos">
				<form className="video-form" onSubmit={submitForm}>
					<div className="form-heading">
						<h2>{pageTitle}</h2>
						{editingId && (
							<button className="link-button" type="button" onClick={resetForm}>
								Cancelar edição
							</button>
						)}
					</div>

					<label>
						Título
						<input
							name="title"
							value={form.title}
							onChange={updateField}
							maxLength="255"
							required
						/>
					</label>
					<label>
						Descrição
						<textarea
							name="description"
							value={form.description}
							onChange={updateField}
							rows="4"
							required
						/>
					</label>
					<label>
						Duração (segundos)
						<input
							name="duration"
							value={form.duration}
							onChange={updateField}
							type="number"
							min="0"
							step="1"
							required
						/>
					</label>
					{!editingId && (
						<div className="upload-field">
							<label htmlFor="video-file">
								Arquivo de vídeo (máximo de 100 MB)
							</label>
							<input
								key={fileInputKey}
								className="file-input"
								id="video-file"
								accept="video/*"
								onChange={selectVideoFile}
								required
								type="file"
							/>
							<label className="file-picker" htmlFor="video-file">
								Escolher vídeo
							</label>
							<p className="file-name">
								{videoFile?.name || "Nenhum arquivo selecionado"}
							</p>
						</div>
					)}
					<button
						className="primary-button"
						disabled={submitting}
						type="submit"
					>
						{submitting
							? "Salvando…"
							: editingId
								? "Salvar alterações"
								: "Adicionar vídeo"}
					</button>
				</form>

				<section className="video-list">
					<div className="list-header">
						<div>
							<h2>Seus vídeos</h2>
							<p>
								{videos.length}{" "}
								{videos.length === 1
									? "vídeo encontrado"
									: "vídeos encontrados"}
							</p>
						</div>
						<input
							aria-label="Pesquisar vídeos"
							className="search"
							placeholder="Pesquisar por título"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</div>

					{message && (
						<p className={`notice ${message.type}`}>{message.text}</p>
					)}
					{loading ? (
						<p className="state">Carregando vídeos…</p>
					) : videos.length === 0 ? (
						<p className="state">Nenhum vídeo encontrado.</p>
					) : (
						<div className="cards">
							{videos.map((video) => (
								<article className="video-card" key={video.id}>
									<div className="duration">
										{formatDuration(video.duration)}
									</div>
									<h3>{video.title}</h3>
									<p>{video.description}</p>
									<div className="card-actions">
										<button
											type="button"
											onClick={() => navigateTo(`/videos/${video.id}`)}
										>
											Assistir
										</button>
										<button type="button" onClick={() => editVideo(video)}>
											Editar
										</button>
										<button
											className="danger"
											type="button"
											onClick={() => removeVideo(video)}
										>
											Excluir
										</button>
									</div>
								</article>
							))}
						</div>
					)}
				</section>
			</section>
		</main>
	);
}
