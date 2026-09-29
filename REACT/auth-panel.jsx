import { useCallback, useEffect, useState } from "react";
import { readResponse } from "./upload.js";

const emptyUser = { name: "", email: "", password: "", role: "editor" };

export function LoginPanel({ onLogin, onCancel }) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [message, setMessage] = useState(null);
	const [submitting, setSubmitting] = useState(false);

	async function submit(event) {
		event.preventDefault();
		setSubmitting(true);
		setMessage(null);
		try {
			const body = await readResponse(
				await fetch("/api/auth/login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email, password }),
				}),
			);
			onLogin(body.user);
		} catch (error) {
			setMessage(error.message);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<section className="access-panel" aria-labelledby="login-title">
			<div className="panel-heading">
				<div>
					<p className="eyebrow">ACESSO RESTRITO</p>
					<h2 id="login-title">Entrar para gerenciar vídeos</h2>
				</div>
				<button className="link-button" type="button" onClick={onCancel}>
					Fechar
				</button>
			</div>
			<form className="login-form" onSubmit={submit}>
				<label>
					E-mail
					<input
						autoComplete="email"
						type="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						required
					/>
				</label>
				<label>
					Senha
					<input
						autoComplete="current-password"
						type="password"
						minLength="8"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						required
					/>
				</label>
				<button className="primary-button" disabled={submitting} type="submit">
					{submitting ? "Entrando…" : "Entrar"}
				</button>
			</form>
			{message && <p className="notice error">{message}</p>}
		</section>
	);
}

export function UserManagement({ currentUser, onClose }) {
	const [users, setUsers] = useState([]);
	const [form, setForm] = useState(emptyUser);
	const [passwords, setPasswords] = useState({});
	const [message, setMessage] = useState(null);
	const [submitting, setSubmitting] = useState(false);
	const loadUsers = useCallback(async () => {
		try {
			setUsers(await readResponse(await fetch("/api/users")));
		} catch (error) {
			setMessage({ type: "error", text: error.message });
		}
	}, []);
	useEffect(() => {
		loadUsers();
	}, [loadUsers]);

	async function createUser(event) {
		event.preventDefault();
		setSubmitting(true);
		setMessage(null);
		try {
			await readResponse(
				await fetch("/api/users", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(form),
				}),
			);
			setForm(emptyUser);
			setMessage({ type: "success", text: "Usuário criado." });
			await loadUsers();
		} catch (error) {
			setMessage({ type: "error", text: error.message });
		} finally {
			setSubmitting(false);
		}
	}

	async function updateUser(user, changes) {
		setMessage(null);
		try {
			await readResponse(
				await fetch(`/api/users/${user.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: user.name,
						role: user.role,
						active: user.active,
						...changes,
					}),
				}),
			);
			await loadUsers();
		} catch (error) {
			setMessage({ type: "error", text: error.message });
		}
	}

	async function resetPassword(user) {
		const password = passwords[user.id] || "";
		if (password.length < 10) {
			setMessage({
				type: "error",
				text: "A nova senha precisa ter pelo menos 10 caracteres.",
			});
			return;
		}
		try {
			await readResponse(
				await fetch(`/api/users/${user.id}/password`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ password }),
				}),
			);
			setPasswords((current) => ({ ...current, [user.id]: "" }));
			setMessage({ type: "success", text: "Senha atualizada." });
		} catch (error) {
			setMessage({ type: "error", text: error.message });
		}
	}

	return (
		<section className="users-panel" aria-labelledby="users-title">
			<div className="panel-heading">
				<div>
					<p className="eyebrow">ADMINISTRAÇÃO</p>
					<h2 id="users-title">Usuários autorizados</h2>
				</div>
				<button className="link-button" type="button" onClick={onClose}>
					Fechar
				</button>
			</div>
			<form className="user-form" onSubmit={createUser}>
				<label>
					Nome
					<input
						value={form.name}
						onChange={(event) => setForm({ ...form, name: event.target.value })}
						required
					/>
				</label>
				<label>
					E-mail
					<input
						type="email"
						value={form.email}
						onChange={(event) =>
							setForm({ ...form, email: event.target.value })
						}
						required
					/>
				</label>
				<label>
					Senha inicial
					<input
						type="password"
						minLength="10"
						value={form.password}
						onChange={(event) =>
							setForm({ ...form, password: event.target.value })
						}
						required
					/>
				</label>
				<label>
					Permissão
					<select
						value={form.role}
						onChange={(event) => setForm({ ...form, role: event.target.value })}
					>
						<option value="editor">Editor</option>
						<option value="admin">Administrador</option>
					</select>
				</label>
				<button className="primary-button" disabled={submitting} type="submit">
					{submitting ? "Criando…" : "Criar usuário"}
				</button>
			</form>
			{message && <p className={`notice ${message.type}`}>{message.text}</p>}
			<div className="users-list">
				{users.map((user) => (
					<article className="user-row" key={user.id}>
						<div>
							<strong>{user.name}</strong>
							<span>{user.email}</span>
						</div>
						<select
							aria-label={`Permissão de ${user.name}`}
							value={user.role}
							disabled={user.id === currentUser.id}
							onChange={(event) =>
								updateUser(user, { role: event.target.value })
							}
						>
							<option value="editor">Editor</option>
							<option value="admin">Administrador</option>
						</select>
						<label className="status-toggle">
							<input
								type="checkbox"
								checked={user.active}
								disabled={user.id === currentUser.id}
								onChange={(event) =>
									updateUser(user, { active: event.target.checked })
								}
							/>{" "}
							Ativo
						</label>
						<div className="password-reset">
							<input
								aria-label={`Nova senha para ${user.name}`}
								autoComplete="new-password"
								minLength="10"
								placeholder="Nova senha"
								type="password"
								value={passwords[user.id] || ""}
								onChange={(event) =>
									setPasswords((current) => ({
										...current,
										[user.id]: event.target.value,
									}))
								}
							/>
							<button
								className="link-button"
								type="button"
								onClick={() => resetPassword(user)}
							>
								Alterar senha
							</button>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}
