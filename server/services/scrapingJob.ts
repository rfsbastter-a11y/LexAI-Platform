/**
 * ScrapingJob — Ingestão automática do corpus jurídico público
 *
 * Janela de execução: 3h–5h (horário de Brasília)
 * Fonte: SerpAPI com queries filetype:pdf de peças processuais
 * Rate limit: 2s entre queries SerpAPI, 1.5s entre batches de download
 *
 * Ativado automaticamente via cron em server/index.ts
 * Também pode ser disparado manualmente via POST /api/admin/run-scraping-job
 */

import { PIECE_QUERY_SETS } from "../scripts/corpus/queries";
import { ingestCorpusDocument } from "./corpusService";

const SERPAPI_DELAY_MS = 2000;
const BATCH_DELAY_MS = 1500;
const SERPAPI_BASE = "https://serpapi.com/search";

let isRunning = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isWithinWindow(): boolean {
  // 3h–5h Brasília = 06:00–08:00 UTC
  const now = new Date();
  const utcHour = now.getUTCHours();
  return utcHour >= 6 && utcHour < 8;
}

async function searchSerpApi(query: string, apiKey: string): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      engine: "google",
      q: query,
      google_domain: "google.com.br",
      gl: "br",
      hl: "pt-br",
      num: "10",
    });

    const res = await fetch(`${SERPAPI_BASE}?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.organic_results || [];
  } catch {
    return [];
  }
}

export interface ScrapingJobResult {
  queriesRun: number;
  urlsFound: number;
  ingested: number;
  skipped: number;
  durationMs: number;
}

/**
 * Executa a varredura completa do corpus.
 * Não executa se já está rodando ou fora da janela (a menos que force=true).
 */
export async function runScrapingJob(options: {
  force?: boolean;
  maxQueries?: number;
  pieceTypes?: string[];
} = {}): Promise<ScrapingJobResult> {
  const { force = false, maxQueries = 20, pieceTypes } = options;

  if (isRunning) {
    console.log("[ScrapingJob] Already running — skipped");
    return { queriesRun: 0, urlsFound: 0, ingested: 0, skipped: 0, durationMs: 0 };
  }

  if (!force && !isWithinWindow()) {
    console.log("[ScrapingJob] Outside execution window (3h–5h Brasília) — skipped");
    return { queriesRun: 0, urlsFound: 0, ingested: 0, skipped: 0, durationMs: 0 };
  }

  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.error("[ScrapingJob] SERPAPI_API_KEY not set — aborted");
    return { queriesRun: 0, urlsFound: 0, ingested: 0, skipped: 0, durationMs: 0 };
  }

  isRunning = true;
  const startTime = Date.now();
  let queriesRun = 0;
  let urlsFound = 0;
  let ingested = 0;
  let skipped = 0;

  console.log("[ScrapingJob] Starting corpus ingestion run...");

  try {
    // Filtra tipos de peça se especificado
    const querySets = pieceTypes
      ? PIECE_QUERY_SETS.filter((qs) => pieceTypes.includes(qs.pieceType))
      : PIECE_QUERY_SETS;

    outer: for (const querySet of querySets) {
      for (const query of querySet.queries) {
        if (queriesRun >= maxQueries) break outer;

        // Verifica janela a cada query (pode sair da janela durante execução)
        if (!force && !isWithinWindow()) {
          console.log("[ScrapingJob] Window closed — stopping early");
          break outer;
        }

        const results = await searchSerpApi(query, apiKey);
        queriesRun++;
        urlsFound += results.length;

        // Processa resultados em batch (fire-and-forget por URL)
        for (const item of results) {
          if (!item.link) { skipped++; continue; }

          // Dispara ingestão sem aguardar (fire-and-forget)
          ingestCorpusDocument({
            url: item.link,
            snippet: item.snippet || "",
            title: item.title || "",
            docType: querySet.pieceType,
            career: detectCareerFromQuery(query),
          })
            .then(() => ingested++)
            .catch(() => skipped++);

          await sleep(BATCH_DELAY_MS);
        }

        console.log(`[ScrapingJob] Query ${queriesRun}: "${query.substring(0, 60)}" → ${results.length} URLs`);
        await sleep(SERPAPI_DELAY_MS);
      }
    }
  } finally {
    isRunning = false;
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[ScrapingJob] Done — queries: ${queriesRun}, URLs: ${urlsFound}, ingested: ~${ingested}, duration: ${(durationMs / 1000).toFixed(1)}s`
  );

  return { queriesRun, urlsFound, ingested, skipped, durationMs };
}

function detectCareerFromQuery(query: string): string {
  const q = query.toLowerCase();
  if (/pgfn|fazenda nacional|tributário/.test(q)) return "pgfn";
  if (/pgbc|banco central/.test(q)) return "pgbc";
  if (/procurador federal|autarquia/.test(q)) return "procurador_federal";
  if (/agu|advogado da união|união federal/.test(q)) return "advogado_uniao";
  return "geral";
}

export { isRunning as scrapingJobIsRunning };
