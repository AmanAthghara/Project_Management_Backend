const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool(
  isProduction
    ? {
        // ✅ Railway provides this automatically
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        // ✅ Your local .env vars still work in development
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      }
);

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err.message);
  process.exit(1);
});

const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log("PostgreSQL connected successfully");
    client.release();
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }
};

const query = (text, params) => {
  return pool.query(text, params);
};

module.exports = {
  pool,
  query,
  connectDB,
};