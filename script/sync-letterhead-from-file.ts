import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const templatePath = path.join(process.cwd(), "server", "templates", "letterhead", "timbrado_novo.docx");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Letterhead file not found: ${templatePath}`);
  }

  const buffer = await fs.promises.readFile(templatePath);
  const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${buffer.toString("base64")}`;

  const existing = await pool.query(
    "SELECT id FROM letterhead_configs WHERE tenant_id = $1 LIMIT 1",
    [1],
  );

  if (existing.rowCount && existing.rows[0]?.id) {
    await pool.query(
      "UPDATE letterhead_configs SET logo_url = $1, updated_at = NOW() WHERE tenant_id = $2",
      [dataUrl, 1],
    );
  } else {
    await pool.query(
      "INSERT INTO letterhead_configs (tenant_id, logo_url, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())",
      [1, dataUrl],
    );
  }

  console.log("Letterhead synced successfully for tenant 1.");
}

main()
  .catch((error) => {
    console.error("Failed to sync letterhead from file:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
