import sql from "./sqldb.js";

export class DatabasePostgres {
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
		} = video;

		await sql`
            INSERT INTO videos (
                title, description, duration, video_path, video_url,
                video_mime_type, cloudinary_public_id
            )
            VALUES (
                ${title}, ${description}, ${duration}, ${videoPath}, ${videoUrl},
                ${videoMimeType}, ${cloudinaryPublicId}
            )
        `;
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
                cloudinary_public_id AS "cloudinaryPublicId"
        `;

		return result[0] || null;
	}
}
