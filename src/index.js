import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildApp } from "./app.js";
import { pool } from "./db/pool.js";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureSchema() {
  const schemaPath = path.join(__dirname, "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
}

async function main() {
  await ensureSchema();
  const app = await buildApp();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`API listening on http://0.0.0.0:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
