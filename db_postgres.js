import sql from "./sqldb.js";

export class DatabasePostgres {
	async list(search) {
		if (search) {
			return sql`
                SELECT id, title, description,
            duration
                FROM videos
                WHERE title ILIKE ${`%${search}%`}
                ORDER BY title
            `;
		}

		return sql`
            SELECT id, title, description, duration
            FROM videos
            ORDER BY title
        `;
	}

	async create(video) {
		const { title, description, duration } = video;

		await sql`
            INSERT INTO videos (title, description, duration)
            VALUES (${title}, ${description}, ${duration})
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
		const result = await sql`DELETE FROM videos WHERE id = ${id}`;

		return result.count > 0;
	}
}
