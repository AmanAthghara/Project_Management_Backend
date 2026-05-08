const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  "../migrations/001_init.sql",
  "../migrations/002_member_assignment_requests.sql",
];

const runMigrations = async () => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    for (const migrationPath of migrations) {
      const filePath = path.join(__dirname, migrationPath);
      const sql = fs.readFileSync(filePath, "utf8");
      
      console.log(`⏳ Running migration: ${path.basename(filePath)}`);
      await client.query(sql);
      console.log(`✅ Done: ${path.basename(filePath)}`);
    }

    await client.query("COMMIT");
    console.log("🎉 All migrations ran successfully");
    process.exit(0);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed, rolled back:", err.message);
    process.exit(1);
  } finally {
    client.release();
  }
};

runMigrations();