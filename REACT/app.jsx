import { useCallback, useEffect, useMemo, useState } from "react";

const emptyVideo = { title: "", description: "", duration: "" };
const API_URL = "/api/videos";

function formatDuration(seconds) {
	const value = Number(seconds);
	const minutes = Math.floor(value / 60);
	const remainingSeconds = value % 60;

	return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function App() {
	const [videos, setVideos] = useState([]);
	const [search, setSearch] = useState("");
	const [form, setForm] = useState(emptyVideo);
	const [editingId, setEditingId] = useState(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [message, setMessage] = useState(null);

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

	function updateField(event) {
		const { name, value } = event.target;
		setForm((current) => ({ ...current, [name]: value }));
	}

	function resetForm() {
		setForm(emptyVideo);
		setEditingId(null);
	}

	async function submitForm(event) {
		event.preventDefault();
		setSubmitting(true);
		setMessage(null);

		const payload = { ...form, duration: Number(form.duration) };
		const isEditing = Boolean(editingId);

		try {
			const response = await fetch(
				isEditing ? `${API_URL}/${editingId}` : API_URL,
				{
					method: isEditing ? "PUT" : "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				},
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
