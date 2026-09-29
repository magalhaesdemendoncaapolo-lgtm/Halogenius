import {
	createHash,
	randomBytes,
	scrypt as scryptCallback,
	timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const sessionDurationSeconds = 8 * 60 * 60;
const productionCookieName = "__Host-halogenius_session";
const developmentCookieName = "halogenius_session";
let dummyPasswordHash;

function publicError(message, statusCode) {
	return Object.assign(new Error(message), {
		publicMessage: message,
		statusCode,
	});
}

export function normalizeEmail(email) {
	return email.trim().toLowerCase();
}

export async function hashPassword(password) {
	const salt = randomBytes(16);
	const derivedKey = await scrypt(password, salt, 64);
	return `scrypt:${salt.toString("base64url")}:${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
	const [algorithm, saltValue, hashValue] = storedHash.split(":");
	if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
	const expected = Buffer.from(hashValue, "base64url");
	const actual = await scrypt(
		password,
		Buffer.from(saltValue, "base64url"),
		expected.length,
	);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashSessionToken(token) {
	return createHash("sha256").update(token).digest("hex");
}

function readCookies(header = "") {
	return Object.fromEntries(
		header
			.split(";")
			.map((part) => part.trim().split("="))
			.filter(([name, value]) => name && value)
			.map(([name, ...value]) => [name, decodeURIComponent(value.join("="))]),
	);
}

function requestOrigin(request) {
	const forwardedProtocol = request.headers["x-forwarded-proto"];
	const protocol = forwardedProtocol?.split(",")[0]?.trim() || request.protocol;
	const forwardedHost = request.headers["x-forwarded-host"];
	const host = forwardedHost?.split(",")[0]?.trim() || request.headers.host;
	return host ? `${protocol}://${host}` : null;
}

export function createAuthService({
	database,
	production = Boolean(process.env.VERCEL),
}) {
	const cookieName = production ? productionCookieName : developmentCookieName;

	function tokenFromRequest(request) {
		const cookies = readCookies(request.headers.cookie);
		return (
			cookies[productionCookieName] || cookies[developmentCookieName] || null
		);
	}

	return {
		async currentUser(request) {
			const token = tokenFromRequest(request);
			if (!token) return null;
			return database.findAuthSession(hashSessionToken(token));
		},

		async login(email, password) {
			const normalizedEmail = normalizeEmail(email);
			const user = await database.findAuthUserByEmail(normalizedEmail);
			dummyPasswordHash ||= hashPassword("halogenius-dummy-password");
			const validPassword = await verifyPassword(
				password,
				user?.passwordHash || (await dummyPasswordHash),
			);
			if (!user || !validPassword || !user.active) {
				if (user) await database.recordFailedLogin(user.id);
				throw publicError("E-mail ou senha inválidos.", 401);
			}
			if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
				throw publicError(
					"Muitas tentativas. Aguarde 15 minutos e tente novamente.",
					429,
				);
			}
			await database.resetFailedLogin(user.id);
			const token = randomBytes(32).toString("base64url");
			const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);
			await database.createAuthSession(
				user.id,
				hashSessionToken(token),
				expiresAt,
			);
			return {
				token,
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					role: user.role,
				},
			};
		},

		async logout(request) {
			const token = tokenFromRequest(request);
			if (token) await database.deleteAuthSession(hashSessionToken(token));
		},

		assertSameOrigin(request) {
			if (request.headers["sec-fetch-site"] === "cross-site") {
				throw publicError("Origem da requisição não permitida.", 403);
			}
			const origin = request.headers.origin;
			const expectedOrigin = requestOrigin(request);
			if (origin && expectedOrigin && origin !== expectedOrigin) {
				throw publicError("Origem da requisição não permitida.", 403);
			}
		},

		sessionCookie(token) {
			return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDurationSeconds}${production ? "; Secure" : ""}`;
		},

		clearCookie() {
			return `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production ? "; Secure" : ""}`;
		},

		hashPassword,
	};
}
