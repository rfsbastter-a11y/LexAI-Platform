import { pool } from "../db";
import cron from "node-cron";

const SYNC_TABLES = [
  "tenants",
  "users",
  "clients",
  "contracts",
  "cases",
  "deadlines",
  "debtors",
  "invoices",
  "documents",
  "generated_pieces",
  "document_templates",
  "letterhead_configs",
  "negotiations",
  "negotiation_contacts",
  "negotiation_rounds",
  "agenda_events",
  "whatsapp_config",
  "whatsapp_messages",
  "whatsapp_schedule",
  "secretary_config",
  "secretary_actions",
  "email_folders",
  "emails",
  "email_attachments",
  "auth_tokens",
  "conversations",
  "messages",
  "prospection_plans",
  "prospection_leads",
  "prospection_messages",
  "prospection_network",
  "prospection_chat_messages",
  "case_movements",
];

const BATCH_SIZE = 200;

interface SyncStatus {
  lastSync: string | null;
  lastResult: string | null;
  inProgress: boolean;
  tables: Record<string, { rows: number; status: string }>;
}

let syncStatus: SyncStatus = {
  lastSync: null,
  lastResult: null,
  inProgress: false,
  tables: {},
};

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

async function getTableColumns(tableName: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = $1 
     ORDER BY ordinal_position`,
    [tableName]
  );
  return result.rows.map((r: any) => r.column_name);
}

async function exportTable(tableName: string): Promise<{ columns: string[]; rows: any[] }> {
  const columns = await getTableColumns(tableName);
  if (columns.length === 0) return { columns: [], rows: [] };

  const hasId = columns.includes("id");
  const orderBy = hasId ? "ORDER BY id" : "";
  const result = await pool.query(`SELECT * FROM "${tableName}" ${orderBy}`);
  return { columns, rows: result.rows };
}

async function sendBatchToProduction(
  tableName: string,
  columns: string[],
  rows: any[],
  syncSecret: string,
  prodUrl: string,
  retries: number = 2
): Promise<{ success: boolean; inserted: number; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(`${prodUrl}/api/admin/sync-receive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sync-Secret": syncSecret,
        },
        body: JSON.stringify({ table: tableName, columns, rows }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        if (attempt < retries && response.status >= 500) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        return { success: false, inserted: 0, error: `HTTP ${response.status}: ${errorText}` };
      }

      const result = await response.json();
      return { success: true, inserted: result.inserted || 0 };
    } catch (err: any) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return { success: false, inserted: 0, error: err.message };
    }
  }
  return { success: false, inserted: 0, error: "Max retries exceeded" };
}

export async function runSync(): Promise<string> {
  if (syncStatus.inProgress) {
    return "Sync already in progress";
  }

  const syncSecret = process.env.DB_SYNC_SECRET;
  const prodUrl = process.env.PROD_APP_URL;

  if (!syncSecret || !prodUrl) {
    const msg = "DB_SYNC_SECRET or PROD_APP_URL not configured";
    console.log(`[DBSync] ${msg}`);
    return msg;
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
  if (isProduction) {
    const msg = "Sync skipped: running in production environment (sync only runs from dev)";
    console.log(`[DBSync] ${msg}`);
    return msg;
  }

  syncStatus.inProgress = true;
  syncStatus.tables = {};
  const startTime = Date.now();
  console.log(`[DBSync] Starting database sync to ${prodUrl}...`);

  let totalRows = 0;
  let totalErrors = 0;
  const errors: string[] = [];

  for (const tableName of SYNC_TABLES) {
    try {
      const { columns, rows } = await exportTable(tableName);

      if (rows.length === 0) {
        syncStatus.tables[tableName] = { rows: 0, status: "empty" };
        continue;
      }

      let insertedTotal = 0;
      let tableHasError = false;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const result = await sendBatchToProduction(tableName, columns, batch, syncSecret, prodUrl);

        if (result.success) {
          insertedTotal += result.inserted;
        } else {
          tableHasError = true;
          const errMsg = `${tableName} batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.error}`;
          errors.push(errMsg);
          console.error(`[DBSync] ERROR: ${errMsg}`);
        }

        if (i + BATCH_SIZE < rows.length) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      syncStatus.tables[tableName] = {
        rows: insertedTotal,
        status: tableHasError ? "partial" : "ok",
      };
      totalRows += insertedTotal;
      if (tableHasError) totalErrors++;

      console.log(`[DBSync] ${tableName}: ${insertedTotal}/${rows.length} rows synced${tableHasError ? " (with errors)" : ""}`);
    } catch (err: any) {
      totalErrors++;
      const errMsg = `${tableName}: ${err.message}`;
      errors.push(errMsg);
      syncStatus.tables[tableName] = { rows: 0, status: "error" };
      console.error(`[DBSync] ERROR: ${errMsg}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const resultMsg = `Sync completed in ${elapsed}s: ${totalRows} rows synced, ${totalErrors} errors${errors.length > 0 ? `. Errors: ${errors.join("; ")}` : ""}`;
  console.log(`[DBSync] ${resultMsg}`);

  syncStatus.lastSync = new Date().toISOString();
  syncStatus.lastResult = resultMsg;
  syncStatus.inProgress = false;

  return resultMsg;
}

export function startSyncSchedule(): void {
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
  if (isProduction) {
    console.log("[DBSync] Production environment detected - sync scheduler disabled (sync only runs from dev)");
    return;
  }

  if (!process.env.DB_SYNC_SECRET || !process.env.PROD_APP_URL) {
    console.log("[DBSync] DB_SYNC_SECRET or PROD_APP_URL not configured - sync scheduler disabled");
    return;
  }

  cron.schedule("0 6 * * *", async () => {
    console.log("[DBSync] Nightly sync triggered (3AM Brasília / 6AM UTC)");
    try {
      await runSync();
    } catch (err: any) {
      console.error(`[DBSync] Nightly sync failed: ${err.message}`);
    }
  }, {
    timezone: "UTC",
  });

  console.log("[DBSync] Nightly sync scheduled for 3AM Brasília (6AM UTC)");

  setTimeout(async () => {
    console.log("[DBSync] Initial sync starting (2 min after server start)...");
    try {
      await runSync();
    } catch (err: any) {
      console.error(`[DBSync] Initial sync failed: ${err.message}`);
    }
  }, 2 * 60 * 1000);
}
