import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.query("SELECT current_database(), inet_server_port()").then(async res => {
  const row = res.rows[0];
  console.log(`[DB] Connected to database: "${row.current_database}" on port ${row.inet_server_port || "default"} (env: ${process.env.NODE_ENV || "development"})`);

  try {
    const colCheck = await pool.query(
      "SELECT data_type FROM information_schema.columns WHERE table_name = 'meeting_utterances' AND column_name = 'timestamp_ms'"
    );
    if (colCheck.rows.length > 0 && colCheck.rows[0].data_type !== "bigint") {
      console.log("[DB Migration] Upgrading meeting_utterances.timestamp_ms to bigint...");
      await pool.query("ALTER TABLE meeting_utterances ALTER COLUMN timestamp_ms TYPE bigint USING timestamp_ms::bigint");
      console.log("[DB Migration] timestamp_ms upgraded to bigint successfully.");
    }
  } catch (migErr: any) {
    if (!migErr.message?.includes("does not exist")) {
      console.error("[DB Migration] timestamp_ms check failed:", migErr.message);
    }
  }

  try {
    const paCol = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'secretary_actions' AND column_name = 'pending_action'"
    );
    if (paCol.rows.length === 0) {
      console.log("[DB Migration] Adding pending_action column to secretary_actions...");
      await pool.query("ALTER TABLE secretary_actions ADD COLUMN IF NOT EXISTS pending_action jsonb");
      console.log("[DB Migration] pending_action column added successfully.");
    }
  } catch (migErr: any) {
    console.error("[DB Migration] pending_action column migration failed:", migErr.message);
  }
}).catch(err => {
  console.error("[DB] Failed to verify database connection:", err.message);
});

export const db = drizzle(pool, { schema });
