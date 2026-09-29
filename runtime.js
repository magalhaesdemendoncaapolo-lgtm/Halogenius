import { buildApp } from "./app.js";
import { createAuthService } from "./auth.js";
import { DatabasePostgres } from "./db_postgres.js";
import { createMediaService } from "./media.js";

const database = new DatabasePostgres();
export const app = buildApp({
	database,
	media: createMediaService(),
	auth: createAuthService({ database }),
});
