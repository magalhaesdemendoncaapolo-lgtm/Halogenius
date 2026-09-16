import "dotenv/config";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL não foi definida no arquivo .env");
}

const sql = postgres(process.env.DATABASE_URL);

export default sql;
