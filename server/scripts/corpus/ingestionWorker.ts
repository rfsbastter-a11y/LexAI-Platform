/**
 * LexAI Corpus Ingestion Worker
 *
 * Motor de ingestão de peças processuais públicas.
 * Usa SerpAPI (já configurado no LexAI) para descobrir PDFs via queries
 * orientadas por tipo de peça, baixa, extrai, classifica, deduplica e indexa.
 *
 * ─── USO ────────────────────────────────────────────────────────────────────
 * Rodada única:
 *   npx tsx server/scripts/corpus/ingestionWorker.ts
 *
 * Filtrar por tipo de peça:
 *   npx tsx server/scripts/corpus/ingestionWorker.ts --piece-type=contestacao
 *
 * Somente queries de instituição:
 *   npx tsx server/scripts/corpus/ingestionWorker.ts --institution-queries
 *
 * Limitar quantas queries rodar (útil para testar com poucos créditos):
 *   npx tsx server/scripts/corpus/ingestionWorker.ts --max-queries=10
 *
 * Para rodar 24/7 via cron (recomendado):
 *   0 2 * * * cd /home/user/LexAI-Platform && npx tsx server/scripts/corpus/ingestionWorker.ts >> logs/corpus.log 2>&1
 * ────────────────────────────────────────────────────────────────────────────
 */

import "dotenv/config";
import { pool } from "../../db";
import { embeddingService } from "../../services/embeddingService";
import { PIECE_QUERY_SETS, INSTITUTION_QUERIES } from "./queries";
import { downloadAndExtract } from "./pdfExtractor";
import { classifyWithAI, classifyWithRegex } from "./classifier";

const SERP_API_KEY = process.env.SERPAPI_API_KEY;
const RATE_LIMIT_MS = 2000;    // 2s entre requests SerpAPI
const DOWNLOAD_DELAY_MS = 1500; // 1.5s entre downloads
const MAX_RESULTS_PER_QUERY = 5; // resultados por query SerpAPI
const MIN_TEXT_LENGTH = 800;     // descartar documentos muito curtos
const MIN_QUALITY_SCORE = 4;     // descartar classificações de baixa qualidade

interface SerpResult {
  title: string;
  link: string;
  snippet?: string;
}

// ─── SerpAPI ─────────────────────────────────────────────────────────────────

async function searchSerpApi(query: string): Promise<SerpResult[]> {
  if (!SERP_API_KEY) throw new Error("SERPAPI_API_KEY não configurado");

  const params = new URLSearchParams({
    api_key: SERP_API_KEY,
    q: query,
    google_domain: "google.com.br",
    gl: "br",
    hl: "pt-br",
    num: MAX_RESULTS_PER_QUERY.toString(),
    safe: "off",
  });

  const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`SerpAPI error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return (data.organic_results || []) as SerpResult[];
}

// ─── Deduplicação ─────────────────────────────────────────────────────────────

async function isAlreadyIndexed(hash: string, url: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM legal_corpus_documents
     WHERE hash = $1 OR source_url = $2
     LIMIT 1`,
    [hash, url]
  );
  return result.rows.length > 0;
}

// ─── Armazenamento ───────────────────────────────────────────────────────────

async function saveDocument(params: {
  career: string;
  source: string;
  entity: string | null;
  docType: string;
  title: string;
  content: string;
  sourceUrl: string;
  hash: string;
  institution: string | null;
  tribunal: string | null;
  legalArea: string;
  qualityScore: number;
}): Promise<number | null> {
  try {
    const result = await pool.query(
      `INSERT INTO legal_corpus_documents
         (career, source, entity, doc_type, title, content, source_url, hash,
          institution, tribunal, legal_area, quality_score, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
       ON CONFLICT (hash) DO NOTHING
       RETURNING id`,
      [
        params.career,
        params.source,
        params.entity,
        params.docType,
        params.title.substring(0, 500),
        params.content.substring(0, 100000), // cap at 100KB
        params.sourceUrl,
        params.hash,
        params.institution,
        params.tribunal,
        params.legalArea,
        params.qualityScore,
      ]
    );
    return result.rows[0]?.id ?? null;
  } catch (err: any) {
    console.error("[Corpus] Save failed:", err.message);
    return null;
  }
}

async function saveEmbedding(docId: number, docType: string, content: string): Promise<void> {
  try {
    const embedding = await embeddingService.embedText(content);
    const embeddingLiteral = `[${embedding.join(",")}]`;

    await pool.query(
      `INSERT INTO corpus_embeddings (corpus_doc_id, doc_type, content_preview, embedding)
       VALUES ($1, $2, $3, $4::vector)
       ON CONFLICT (corpus_doc_id) DO NOTHING`,
      [docId, docType, content.substring(0, 1000), embeddingLiteral]
    );
  } catch (err: any) {
    console.warn(`[Corpus] Embedding failed for doc ${docId}:`, err.message);
  }
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

async function processUrl(url: string, hint: { pieceType: string; queryText: string }): Promise<boolean> {
  // 1. Baixar e extrair texto
  const extracted = await downloadAndExtract(url);
  if (!extracted || extracted.text.length < MIN_TEXT_LENGTH) return false;

  // 2. Verificar deduplicação
  const alreadyExists = await isAlreadyIndexed(extracted.hash, url);
  if (alreadyExists) {
    console.log(`  [skip] Já indexado: ${url.substring(0, 80)}`);
    return false;
  }

  // 3. Classificar (tenta AI primeiro, fallback regex)
  let classification;
  try {
    classification = await classifyWithAI(extracted.text);
  } catch {
    classification = classifyWithRegex(extracted.text);
  }

  // 4. Filtros de qualidade
  if (!classification.isLegalDocument) {
    console.log(`  [skip] Não é peça jurídica: ${url.substring(0, 80)}`);
    return false;
  }
  if (classification.qualityScore < MIN_QUALITY_SCORE) {
    console.log(`  [skip] Qualidade baixa (${classification.qualityScore}): ${url.substring(0, 80)}`);
    return false;
  }

  // 5. Determinar career baseado na instituição detectada
  const career = resolveCareer(classification.institution, hint.pieceType);

  // 6. Salvar no banco
  const docId = await saveDocument({
    career,
    source: "serp_discovery",
    entity: classification.institution,
    docType: classification.pieceType || hint.pieceType,
    title: url.split("/").pop()?.replace(/\.pdf$/i, "") || hint.queryText,
    content: extracted.text,
    sourceUrl: url,
    hash: extracted.hash,
    institution: classification.institution,
    tribunal: classification.tribunal,
    legalArea: classification.legalArea,
    qualityScore: classification.qualityScore,
  });

  if (!docId) return false;

  // 7. Gerar e salvar embedding (async — não bloqueia o worker)
  void saveEmbedding(docId, classification.pieceType || hint.pieceType, extracted.text);

  console.log(
    `  [✓] Indexado doc ${docId} | tipo: ${classification.pieceType} | área: ${classification.legalArea}` +
    ` | qualidade: ${classification.qualityScore}/10 | ${extracted.wordCount} palavras`
  );

  return true;
}

function resolveCareer(institution: string | null, pieceType: string): string {
  if (!institution) return "advogado_uniao";
  const inst = institution.toUpperCase();
  if (inst.includes("PGFN") || inst.includes("FAZENDA NACIONAL")) return "pgfn";
  if (inst.includes("BACEN") || inst.includes("BANCO CENTRAL")) return "pgbc";
  if (["INSS", "CADE", "ANEEL", "ANP", "IBAMA", "INCRA", "FUNAI", "ANVISA", "ANATEL"].some(e => inst.includes(e))) {
    return "procurador_federal";
  }
  if (inst.includes("AGU") || inst.includes("UNIÃO FEDERAL")) return "advogado_uniao";
  return "advogado_uniao";
}

async function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const filterPieceType = args.find(a => a.startsWith("--piece-type="))?.split("=")[1];
  const institutionQueriesOnly = args.includes("--institution-queries");
  const maxQueries = parseInt(args.find(a => a.startsWith("--max-queries="))?.split("=")[1] || "9999");

  console.log("=== LexAI Corpus Ingestion Worker ===");
  console.log(`SerpAPI key: ${SERP_API_KEY ? "✓ configurada" : "✗ NÃO ENCONTRADA"}`);
  if (!SERP_API_KEY) process.exit(1);

  // Garantir tabelas existem (migradas no db.ts, mas checando aqui também)
  await ensureCorpusEmbeddingsTable();

  let totalQueries = 0;
  let totalFound = 0;
  let totalIndexed = 0;

  // ── Queries por tipo de peça ──
  if (!institutionQueriesOnly) {
    const sets = filterPieceType
      ? PIECE_QUERY_SETS.filter(s => s.pieceType === filterPieceType)
      : PIECE_QUERY_SETS.sort((a, b) => b.weight - a.weight); // maior peso primeiro

    for (const set of sets) {
      console.log(`\n── ${set.label} ──`);

      for (const query of set.queries) {
        if (totalQueries >= maxQueries) break;
        totalQueries++;

        console.log(`\nQuery ${totalQueries}: ${query}`);

        let results: SerpResult[] = [];
        try {
          results = await searchSerpApi(query);
          await delay(RATE_LIMIT_MS);
        } catch (err: any) {
          console.error(`  [erro SerpAPI]: ${err.message}`);
          continue;
        }

        console.log(`  ${results.length} resultados encontrados`);
        totalFound += results.length;

        for (const result of results) {
          if (!result.link) continue;

          console.log(`  → ${result.title?.substring(0, 60) || "sem título"}`);
          console.log(`    ${result.link.substring(0, 80)}`);

          const indexed = await processUrl(result.link, {
            pieceType: set.pieceType,
            queryText: query,
          });
          if (indexed) totalIndexed++;

          await delay(DOWNLOAD_DELAY_MS);
        }
      }
    }
  }

  // ── Queries por instituição ──
  if (institutionQueriesOnly || !filterPieceType) {
    console.log("\n── Queries por Instituição ──");

    for (const query of INSTITUTION_QUERIES) {
      if (totalQueries >= maxQueries) break;
      totalQueries++;

      console.log(`\nQuery ${totalQueries}: ${query}`);

      let results: SerpResult[] = [];
      try {
        results = await searchSerpApi(query);
        await delay(RATE_LIMIT_MS);
      } catch (err: any) {
        console.error(`  [erro SerpAPI]: ${err.message}`);
        continue;
      }

      totalFound += results.length;

      for (const result of results) {
        if (!result.link) continue;

        const indexed = await processUrl(result.link, {
          pieceType: "outros",
          queryText: query,
        });
        if (indexed) totalIndexed++;

        await delay(DOWNLOAD_DELAY_MS);
      }
    }
  }

  // ── Resumo ──
  console.log("\n=== Resumo da Ingestão ===");
  console.log(`Queries executadas: ${totalQueries}`);
  console.log(`Documentos encontrados: ${totalFound}`);
  console.log(`Documentos indexados: ${totalIndexed}`);

  const stats = await pool.query(
    `SELECT doc_type, COUNT(*) AS total
     FROM legal_corpus_documents
     GROUP BY doc_type
     ORDER BY total DESC`
  );
  console.log("\nCorpus total por tipo:");
  for (const row of stats.rows) {
    console.log(`  ${row.doc_type}: ${row.total}`);
  }

  await pool.end();
  process.exit(0);
}

async function ensureCorpusEmbeddingsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS corpus_embeddings (
      id              SERIAL PRIMARY KEY,
      corpus_doc_id   INTEGER NOT NULL REFERENCES legal_corpus_documents(id) ON DELETE CASCADE,
      doc_type        TEXT NOT NULL,
      content_preview TEXT,
      embedding       vector(1536),
      created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE (corpus_doc_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS corpus_embeddings_vector_idx
    ON corpus_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
  `);
}

main().catch(err => {
  console.error("Worker failed:", err);
  process.exit(1);
});
