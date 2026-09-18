import sql from "./sqldb.js";

await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

await sql`
  CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    duration INTEGER NOT NULL CHECK (duration >= 0),
    video_path TEXT,
    video_url TEXT,
    video_mime_type TEXT,
    cloudinary_public_id TEXT
  )
`;

await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS video_path TEXT`;
await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS video_mime_type TEXT`;
await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS video_url TEXT`;
await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT`;

await sql.end();
