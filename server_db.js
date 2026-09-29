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
await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS imagekit_file_id TEXT`;
await sql`
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (LOWER(email))`;
await sql`
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS sessions_user_id_index ON sessions (user_id)`;
await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS videos_imagekit_file_id_unique ON videos (imagekit_file_id) WHERE imagekit_file_id IS NOT NULL`;
await sql`DELETE FROM sessions WHERE expires_at <= NOW()`;

await sql.end();
