import { buildApp } from "./app.js";
import { DatabasePostgres } from "./db_postgres.js";
import { createMediaService } from "./media.js";

export const app = buildApp({
	database: new DatabasePostgres(),
	media: createMediaService(),
});
