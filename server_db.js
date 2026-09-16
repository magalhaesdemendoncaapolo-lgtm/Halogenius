import sql from "./sqldb.js";

await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

await sql`
  CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    duration INTEGER NOT NULL CHECK (duration >= 0)
  )
`;

await sql.end();
