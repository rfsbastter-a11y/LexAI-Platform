/**
 * Harvey Technique: Backfill Embeddings
 *
 * One-time script to index all existing human-approved pieces into pgvector.
 * Run once after deploying the Harvey RAG changes.
 *
 * Usage:
 *   cd /home/user/LexAI-Platform
 *   npx tsx server/scripts/backfillEmbeddings.ts
 *   npx tsx server/scripts/backfillEmbeddings.ts --tenant 2   (specific tenant)
 *   npx tsx server/scripts/backfillEmbeddings.ts --all        (all tenants)
 */

import "dotenv/config";
import { pool } from "../db";
import { embeddingService } from "../services/embeddingService";

async function main() {
  const args = process.argv.slice(2);
  const tenantArg = args.find(a => a.startsWith("--tenant=") || a === "--tenant");
  const tenantIdFromArg = tenantArg
    ? parseInt(args[args.indexOf("--tenant") + 1] || tenantArg.split("=")[1])
    : null;
  const allTenants = args.includes("--all");

  console.log("=== LexAI Harvey — Embedding Backfill ===");

  let tenantIds: number[] = [];

  if (tenantIdFromArg) {
    tenantIds = [tenantIdFromArg];
  } else if (allTenants) {
    const result = await pool.query("SELECT id, name FROM tenants WHERE is_active = TRUE ORDER BY id");
    tenantIds = result.rows.map(r => r.id);
    console.log(`Found ${tenantIds.length} active tenants: ${result.rows.map(r => `${r.id} (${r.name})`).join(", ")}`);
  } else {
    // Default: tenant 1
    tenantIds = [1];
    console.log("No --tenant or --all flag provided. Defaulting to tenant 1.");
    console.log("Usage: npx tsx server/scripts/backfillEmbeddings.ts --tenant=2 | --all");
  }

  // Check pgvector availability
  try {
    await pool.query("SELECT '[1,2,3]'::vector");
  } catch {
    console.error("ERROR: pgvector extension is not installed or not enabled.");
    console.error("Run: CREATE EXTENSION IF NOT EXISTS vector; in your PostgreSQL database.");
    process.exit(1);
  }

  let totalIndexed = 0;
  let totalSkipped = 0;

  for (const tenantId of tenantIds) {
    console.log(`\nProcessing tenant ${tenantId}...`);

    // Count what needs indexing
    const pending = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM generated_pieces gp
       LEFT JOIN piece_embeddings pe ON pe.piece_id = gp.id
       WHERE gp.tenant_id = $1
         AND gp.human_approved = TRUE
         AND pe.id IS NULL`,
      [tenantId]
    );
    const pendingCount = parseInt(pending.rows[0].cnt);
    console.log(`  ${pendingCount} approved pieces need indexing`);

    if (pendingCount === 0) {
      console.log("  Nothing to do.");
      continue;
    }

    const { indexed, skipped } = await embeddingService.indexAllApprovedPieces(tenantId, 100);
    console.log(`  ✓ Indexed: ${indexed}  |  Skipped: ${skipped}`);
    totalIndexed += indexed;
    totalSkipped += skipped;
  }

  console.log(`\n=== Done ===`);
  console.log(`Total indexed: ${totalIndexed}`);
  console.log(`Total skipped: ${totalSkipped}`);

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
