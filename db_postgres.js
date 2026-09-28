import sql from "./sqldb.js";

export class DatabasePostgres {
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
                video_mime_type, cloudinary_public_id, imagekit_file_id
            )
            VALUES (
                ${title}, ${description}, ${duration}, ${videoPath}, ${videoUrl},
                ${videoMimeType}, ${cloudinaryPublicId}, ${imagekitFileId}
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
