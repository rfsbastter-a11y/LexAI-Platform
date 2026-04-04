/**
 * Harvey Technique: Fine-tuning Data Export
 *
 * Exports human-approved generation pairs as OpenAI JSONL fine-tuning format.
 * Run when you have ≥50 approved pieces. Fine-tune when you have ≥500.
 *
 * Usage:
 *   npx tsx server/scripts/exportFineTuningData.ts
 *   npx tsx server/scripts/exportFineTuningData.ts --tenant=1 --output=./data/train.jsonl
 *   npx tsx server/scripts/exportFineTuningData.ts --min-chars=8000 --piece-types=recurso_apelacao,peticao_inicial
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { pool } from "../db";

interface FineTuningExample {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}

// Hallucination markers that disqualify a training example
const HALLUCINATION_MARKERS = [
  "[NÚMERO]", "[MINISTRO]", "[DATA]", "[RELATOR]",
  "XXXXXXX", "YYYYYYY", "[COMPLETAR]", "[INSERIR]",
  "número do processo", "nome do relator",
];

function hasHallucinationMarkers(text: string): boolean {
  const lower = text.toLowerCase();
  return HALLUCINATION_MARKERS.some(m => lower.includes(m.toLowerCase()));
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function main() {
  const args = process.argv.slice(2);

  const tenantId = parseInt(
    args.find(a => a.startsWith("--tenant="))?.split("=")[1] || "1"
  );
  const minChars = parseInt(
    args.find(a => a.startsWith("--min-chars="))?.split("=")[1] || "4000"
  );
  const pieceTypesArg = args.find(a => a.startsWith("--piece-types="))?.split("=")[1];
  const allowedPieceTypes = pieceTypesArg ? pieceTypesArg.split(",") : null;

  const dateStr = new Date().toISOString().split("T")[0];
  const defaultOutput = path.join(process.cwd(), "data", `finetune_lexai_${dateStr}.jsonl`);
  const outputPath = args.find(a => a.startsWith("--output="))?.split("=")[1] || defaultOutput;

  console.log("=== LexAI Harvey — Fine-tuning Data Export ===");
  console.log(`Tenant: ${tenantId}`);
  console.log(`Min chars: ${minChars}`);
  console.log(`Piece types filter: ${allowedPieceTypes?.join(", ") || "all"}`);
  console.log(`Output: ${outputPath}`);
  console.log("");

  // Query: approved logs joined with full piece content
  // Requires generated_piece_id FK (added in Harvey migration)
  const result = await pool.query(
    `SELECT
       al.id                AS log_id,
       al.full_prompt       AS system_prompt,
       al.prompt            AS user_preview,
       al.model_used,
       al.tokens_used,
       al.created_at,
       gp.id                AS piece_id,
       gp.piece_type,
       gp.content_text      AS assistant_content,
       gp.content_html
     FROM ai_generation_logs al
     JOIN generated_pieces gp ON gp.id = al.generated_piece_id
     WHERE al.tenant_id = $1
       AND gp.human_approved = TRUE
       AND gp.approved_at IS NOT NULL
     ORDER BY gp.approved_at DESC`,
    [tenantId]
  );

  console.log(`Found ${result.rows.length} approved logs with piece content.`);

  // Also query pieces that were approved but may not have a log link yet
  const directResult = await pool.query(
    `SELECT
       gp.id         AS piece_id,
       gp.piece_type,
       gp.prompt     AS user_prompt,
       gp.content_text,
       gp.content_html,
       gp.approved_at
     FROM generated_pieces gp
     WHERE gp.tenant_id = $1
       AND gp.human_approved = TRUE
       AND gp.approved_at IS NOT NULL
       AND gp.id NOT IN (
         SELECT generated_piece_id FROM ai_generation_logs
         WHERE generated_piece_id IS NOT NULL AND tenant_id = $1
       )`,
    [tenantId]
  );

  console.log(`Found ${directResult.rows.length} additional approved pieces (no log link).`);

  const examples: FineTuningExample[] = [];
  const stats: Record<string, number> = {};
  let skippedTooShort = 0;
  let skippedHallucination = 0;
  let skippedNoPieceType = 0;

  // Process log-linked examples
  for (const row of result.rows) {
    const assistantText = row.assistant_content
      || (row.content_html as string | null)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      || "";

    if (assistantText.length < minChars) { skippedTooShort++; continue; }
    if (hasHallucinationMarkers(assistantText)) { skippedHallucination++; continue; }
    if (!row.piece_type) { skippedNoPieceType++; continue; }
    if (allowedPieceTypes && !allowedPieceTypes.includes(row.piece_type)) continue;

    const systemContent = row.system_prompt
      || `Você é um advogado brasileiro sênior especializado em redação jurídica de alto nível. Produza a peça solicitada com máxima qualidade, sem inventar fatos, jurisprudência ou legislação.`;

    const userContent = row.user_preview
      || `TIPO DE PEÇA: ${row.piece_type}\n\nGere a peça conforme solicitado.`;

    const totalTokens = estimateTokens(systemContent) + estimateTokens(userContent) + estimateTokens(assistantText);
    if (totalTokens > 128000) continue; // OpenAI limit for gpt-4o-mini fine-tuning

    examples.push({
      messages: [
        { role: "system", content: systemContent.substring(0, 8000) },
        { role: "user",   content: userContent.substring(0, 8000) },
        { role: "assistant", content: assistantText },
      ],
    });

    stats[row.piece_type] = (stats[row.piece_type] || 0) + 1;
  }

  // Process direct piece examples (no log link)
  for (const row of directResult.rows) {
    const assistantText = row.content_text
      || (row.content_html as string | null)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      || "";

    if (assistantText.length < minChars) { skippedTooShort++; continue; }
    if (hasHallucinationMarkers(assistantText)) { skippedHallucination++; continue; }
    if (!row.piece_type) { skippedNoPieceType++; continue; }
    if (allowedPieceTypes && !allowedPieceTypes.includes(row.piece_type)) continue;

    const systemContent = `Você é um advogado brasileiro sênior especializado em redação jurídica de alto nível. Produza a peça solicitada com máxima qualidade, sem inventar fatos, jurisprudência ou legislação.`;
    const userContent = row.user_prompt
      ? `TIPO DE PEÇA: ${row.piece_type}\n\n${row.user_prompt}`
      : `TIPO DE PEÇA: ${row.piece_type}\n\nGere a peça conforme solicitado.`;

    examples.push({
      messages: [
        { role: "system",    content: systemContent },
        { role: "user",      content: userContent.substring(0, 8000) },
        { role: "assistant", content: assistantText },
      ],
    });

    stats[row.piece_type] = (stats[row.piece_type] || 0) + 1;
  }

  // Write output
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const jsonlContent = examples.map(e => JSON.stringify(e)).join("\n");
  fs.writeFileSync(outputPath, jsonlContent, "utf-8");

  // Summary
  const totalTokensEstimate = examples.reduce((sum, e) => {
    return sum + e.messages.reduce((s, m) => s + estimateTokens(m.content), 0);
  }, 0);
  const estimatedCost = (totalTokensEstimate / 1_000_000) * 3.40; // gpt-4o-mini fine-tune: $3.40/1M tokens

  console.log("\n=== Export Summary ===");
  console.log(`✓ Examples exported:  ${examples.length}`);
  console.log(`✗ Skipped too short:  ${skippedTooShort}`);
  console.log(`✗ Skipped hallucination markers: ${skippedHallucination}`);
  console.log(`✗ Skipped no piece type: ${skippedNoPieceType}`);
  console.log(`\nDistribution by piece type:`);
  for (const [type, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    const warning = count < 10 ? " ⚠️  (< 10 examples, consider more data)" : "";
    console.log(`  ${type}: ${count}${warning}`);
  }
  console.log(`\nEstimated tokens: ${totalTokensEstimate.toLocaleString()}`);
  console.log(`Estimated fine-tuning cost (gpt-4o-mini): ~$${estimatedCost.toFixed(2)}`);
  console.log(`\nOutput: ${outputPath}`);
  console.log("\nNext step when you have ≥500 examples:");
  console.log("  npx tsx server/scripts/startFineTuning.ts --file=" + outputPath);

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error("Export failed:", err);
  process.exit(1);
});
