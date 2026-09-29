import sql from "./sqldb.js";

export class DatabasePostgres {
	async findAuthUserByEmail(email) {
		const rows = await sql`
			SELECT id, name, email, password_hash AS "passwordHash", role, active,
				locked_until AS "lockedUntil"
			FROM users WHERE LOWER(email) = LOWER(${email})
		`;
		return rows[0] || null;
	}

	async createAuthSession(userId, tokenHash, expiresAt) {
		await sql`DELETE FROM sessions WHERE expires_at <= NOW()`;
		await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${tokenHash}, ${userId}, ${expiresAt})`;
	}

	async findAuthSession(tokenHash) {
		const rows = await sql`
			SELECT users.id, users.name, users.email, users.role
			FROM sessions JOIN users ON users.id = sessions.user_id
			WHERE sessions.token_hash = ${tokenHash}
				AND sessions.expires_at > NOW() AND users.active = TRUE
		`;
		return rows[0] || null;
	}

	async deleteAuthSession(tokenHash) {
		await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
	}

	async recordFailedLogin(id) {
		await sql`
			UPDATE users SET
				failed_attempts = failed_attempts + 1,
				locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END,
				updated_at = NOW()
			WHERE id = ${id}
		`;
	}

	async resetFailedLogin(id) {
		await sql`UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = ${id}`;
	}

	async listUsers() {
		return sql`SELECT id, name, email, role, active, created_at AS "createdAt" FROM users ORDER BY name`;
	}

	async findUser(id) {
		const rows =
			await sql`SELECT id, name, email, role, active FROM users WHERE id = ${id}`;
		return rows[0] || null;
	}

	async createUser(user) {
		const rows = await sql`
			INSERT INTO users (name, email, password_hash, role)
			VALUES (${user.name}, ${user.email}, ${user.passwordHash}, ${user.role})
			RETURNING id, name, email, role, active, created_at AS "createdAt"
		`;
		return rows[0];
	}

	async updateUser(id, user) {
		return sql.begin(async (transaction) => {
			const rows = await transaction`
				UPDATE users SET name = ${user.name}, role = ${user.role}, active = ${user.active}, updated_at = NOW()
				WHERE id = ${id}
				RETURNING id, name, email, role, active, created_at AS "createdAt"
			`;
			if (!user.active)
				await transaction`DELETE FROM sessions WHERE user_id = ${id}`;
			return rows[0] || null;
		});
	}

	async updateUserPassword(id, passwordHash) {
		return sql.begin(async (transaction) => {
			const result = await transaction`
				UPDATE users SET password_hash = ${passwordHash}, failed_attempts = 0,
					locked_until = NULL, updated_at = NOW() WHERE id = ${id}
			`;
			if (result.count)
				await transaction`DELETE FROM sessions WHERE user_id = ${id}`;
			return result.count > 0;
		});
	}

	async countActiveAdmins() {
		const rows =
			await sql`SELECT COUNT(*)::INTEGER AS count FROM users WHERE role = 'admin' AND active = TRUE`;
		return rows[0].count;
	}

	async upsertAdmin({ name, email, passwordHash }) {
		const existing = await this.findAuthUserByEmail(email);
		if (existing) {
			const rows = await sql`
				UPDATE users SET name = ${name}, password_hash = ${passwordHash}, role = 'admin',
					active = TRUE, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
				WHERE id = ${existing.id}
				RETURNING id, name, email, role, active
			`;
			return rows[0];
		}
		return this.createUser({ name, email, passwordHash, role: "admin" });
	}
	async find(id) {
		const rows =
			await sql`SELECT id, imagekit_file_id AS "imagekitFileId" FROM videos WHERE id = ${id}`;
		return rows[0] || null;
	}
	async list(search) {
		if (search) {
			return sql`
				SELECT id, title, description, duration,
                    COALESCE(video_url, video_path) AS "videoUrl"
                FROM videos
                WHERE title ILIKE ${`%${search}%`}
                ORDER BY title
            `;
		}

		return sql`
			SELECT id, title, description, duration,
                COALESCE(video_url, video_path) AS "videoUrl"
            FROM videos
            ORDER BY title
        `;
	}

	async create(video) {
		const {
			title,
			description,
			duration,
			videoPath,
			videoUrl,
			videoMimeType,
			cloudinaryPublicId,
			imagekitFileId,
			createdBy,
		} = video;

		await sql.begin(async (transaction) => {
			// Serialize retries for this upload, including retries on another Vercel instance.
			await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${imagekitFileId}, 0))`;
			const existing =
				await transaction`SELECT id FROM videos WHERE imagekit_file_id = ${imagekitFileId}`;
			if (existing.length) return;
			await transaction`
            INSERT INTO videos (
                title, description, duration, video_path, video_url,
                video_mime_type, cloudinary_public_id, imagekit_file_id, created_by
            )
            VALUES (
                ${title}, ${description}, ${duration}, ${videoPath}, ${videoUrl},
                ${videoMimeType}, ${cloudinaryPublicId}, ${imagekitFileId}, ${createdBy}
            )
        `;
		});
	}

	async update(id, video) {
		const { title, description, duration } = video;

		const result = await sql`
            UPDATE videos
            SET title = ${title}, description = ${description}, duration = ${duration}
            WHERE id = ${id}
        `;

		return result.count > 0;
	}

	async delete(id) {
		const result = await sql`
            DELETE FROM videos
            WHERE id = ${id}
            RETURNING
                video_path AS "videoPath",
                cloudinary_public_id AS "cloudinaryPublicId",
                imagekit_file_id AS "imagekitFileId"
        `;

		return result[0] || null;
	}
}
