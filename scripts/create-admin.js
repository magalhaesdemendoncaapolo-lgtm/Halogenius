import { argv, exit, stdin, stdout } from "node:process";
import { hashPassword, normalizeEmail } from "../auth.js";
import { DatabasePostgres } from "../db_postgres.js";
import sql from "../sqldb.js";

function argument(name) {
	const index = argv.indexOf(name);
	return index >= 0 ? argv[index + 1]?.trim() : "";
}

function readHidden(prompt) {
	if (!stdin.isTTY)
		throw new Error("Execute este comando em um terminal interativo.");
	stdout.write(prompt);
	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding("utf8");
	return new Promise((resolve, reject) => {
		let value = "";
		function finish(error) {
			stdin.setRawMode(false);
			stdin.pause();
			stdin.off("data", onData);
			stdout.write("\n");
			if (error) reject(error);
			else resolve(value);
		}
		function onData(input) {
			for (const character of input) {
				if (character === "\u0003")
					return finish(new Error("Operação cancelada."));
				if (character === "\r" || character === "\n") return finish();
				if (character === "\u007f" || character === "\b") {
					if (value) {
						value = value.slice(0, -1);
						stdout.write("\b \b");
					}
					continue;
				}
				value += character;
				stdout.write("*");
			}
		}
		stdin.on("data", onData);
	});
}

const email = normalizeEmail(argument("--email"));
const name = argument("--name");
if (!email || !name) {
	console.error(
		'Uso: npm.cmd run admin:create -- --email "voce@exemplo.com" --name "Seu nome"',
	);
	exit(1);
}

try {
	const password = await readHidden(
		"Senha do administrador (mínimo de 10 caracteres): ",
	);
	if (password.length < 10)
		throw new Error("A senha precisa ter pelo menos 10 caracteres.");
	const confirmation = await readHidden("Repita a senha: ");
	if (password !== confirmation) throw new Error("As senhas não são iguais.");
	const database = new DatabasePostgres();
	const user = await database.upsertAdmin({
		name,
		email,
		passwordHash: await hashPassword(password),
	});
	console.log(`Administrador preparado: ${user.email}`);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
} finally {
	await sql.end({ timeout: 2 });
}
