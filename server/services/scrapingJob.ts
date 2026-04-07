/**
 * ScrapingJob — Ingestão automática do corpus jurídico público
 *
 * Estratégia: matriz TIPO DE PEÇA × INSTITUIÇÃO
 *   → ex.: "contestação" "ANEEL" filetype:pdf → 10 PDFs reais
 *   → "apelação" "CADE" filetype:pdf → 10 PDFs reais
 *   → etc.
 *
 * Janela de execução: 3h–5h (horário de Brasília = 06:00–08:00 UTC)
 * Rate limit: 2s entre queries SerpAPI, 1.5s entre batches de download
 *
 * Ativado via cron em server/index.ts (diário 06:00 UTC)
 * Ou manualmente via POST /api/admin/run-scraping-job
 */

import { buildQueryMatrix, TOP_PIECE_TYPES, TOP_INSTITUTIONS } from "../scripts/corpus/queries";
import { ingestCorpusDocument } from "./corpusService";

const SERPAPI_DELAY_MS = 2000;
const BATCH_DELAY_MS  = 1500;
const RESULTS_PER_CELL = 10;    // 10 PDFs por combinação tipo × instituição
const SERPAPI_BASE = "https://serpapi.com/search";

let isRunning = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Verifica se está na janela 3h–5h Brasília (06:00–08:00 UTC) */
function isWithinWindow(): boolean {
  const utcHour = new Date().getUTCHours();
  return utcHour >= 6 && utcHour < 8;
}

async function searchSerpApi(query: string, apiKey: string, num = 10): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      engine:  "google",
      q:       query,
      google_domain: "google.com.br",
      gl:  "br",
      hl:  "pt-br",
      num: String(Math.min(num, 10)),
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
  cellsRun:    number;
  urlsFound:   number;
  ingested:    number;
  skipped:     number;
  durationMs:  number;
}

export interface ScrapingJobOptions {
  force?:          boolean;
  maxCells?:       number;   // limite de células da matriz a processar
  onlyPieceTypes?: string[]; // ex.: ["contestacao", "recurso_apelacao"]
  onlyInstitutions?: string[]; // ex.: ["aneel", "cade", "inss"]
  resultsPerCell?: number;   // padrão: 10
}

/**
 * Executa a varredura pela matriz tipo × instituição.
 * Cada célula busca N PDFs via SerpAPI e ingere em fire-and-forget.
 */
export async function runScrapingJob(options: ScrapingJobOptions = {}): Promise<ScrapingJobResult> {
  const {
    force          = false,
    maxCells       = 50,
    onlyPieceTypes,
    onlyInstitutions,
    resultsPerCell = RESULTS_PER_CELL,
  } = options;

  if (isRunning) {
    console.log("[ScrapingJob] Already running — skipped");
    return { cellsRun: 0, urlsFound: 0, ingested: 0, skipped: 0, durationMs: 0 };
  }

  if (!force && !isWithinWindow()) {
    console.log("[ScrapingJob] Outside execution window (3h–5h Brasília) — skipped");
    return { cellsRun: 0, urlsFound: 0, ingested: 0, skipped: 0, durationMs: 0 };
  }

  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.error("[ScrapingJob] SERPAPI_API_KEY not set — aborted");
    return { cellsRun: 0, urlsFound: 0, ingested: 0, skipped: 0, durationMs: 0 };
  }

  isRunning = true;
  const startTime = Date.now();
  let cellsRun  = 0;
  let urlsFound = 0;
  let ingested  = 0;
  let skipped   = 0;

  // Constrói a matriz ordenada por prioridade
  const matrix = buildQueryMatrix({ onlyPieceTypes, onlyInstitutions });
  const institution = TOP_INSTITUTIONS.reduce<Record<string, any>>(
    (acc, i) => { acc[i.id] = i; return acc; }, {}
  );

  console.log(
    `[ScrapingJob] Starting — ${matrix.length} cells available, max ${maxCells}, ${resultsPerCell} results/cell`
  );

  try {
    for (const cell of matrix) {
      if (cellsRun >= maxCells) break;

      // Verifica janela a cada célula (pode sair durante execução longa)
      if (!force && !isWithinWindow()) {
        console.log("[ScrapingJob] Window closed — stopping early");
        break;
      }

      const inst = institution[cell.institutionId];
      console.log(`[ScrapingJob] Cell [${cell.pieceTypeId} × ${cell.institutionId}] query: "${cell.query.substring(0, 70)}"`);

      const results = await searchSerpApi(cell.query, apiKey, resultsPerCell);
      cellsRun++;
      urlsFound += results.length;

      // Processa cada URL da célula (fire-and-forget)
      for (const item of results) {
        if (!item.link) { skipped++; continue; }

        ingestCorpusDocument({
          url:         item.link,
          snippet:     item.snippet || "",
          title:       item.title   || "",
          docType:     cell.pieceTypeId,
          career:      cell.career,
          institution: inst?.name,
        })
          .then(() => { ingested++; })
          .catch(() => { skipped++;  });

        await sleep(BATCH_DELAY_MS);
      }

      if (results.length === 0) {
        console.log(`[ScrapingJob]   → 0 results (query may be too specific)`);
        skipped++;
      } else {
        console.log(`[ScrapingJob]   → ${results.length} URLs queued`);
      }

      await sleep(SERPAPI_DELAY_MS);
    }
  } finally {
    isRunning = false;
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[ScrapingJob] Done — cells: ${cellsRun}/${matrix.length}, URLs: ${urlsFound}, ingested: ~${ingested}, duration: ${(durationMs / 1000).toFixed(1)}s`
  );

  return { cellsRun, urlsFound, ingested, skipped, durationMs };
}

export { isRunning as scrapingJobIsRunning };

/**
 * Retorna o plano de execução sem rodar (útil para admin visualizar).
 */
export function getScrapingPlan(options: Omit<ScrapingJobOptions, "force"> = {}) {
  const {
    maxCells       = 50,
    onlyPieceTypes,
    onlyInstitutions,
    resultsPerCell = RESULTS_PER_CELL,
  } = options;

  const matrix = buildQueryMatrix({ onlyPieceTypes, onlyInstitutions });
  const cells = matrix.slice(0, maxCells);

  return {
    totalCells:        matrix.length,
    willProcess:       cells.length,
    estimatedUrls:     cells.length * resultsPerCell,
    estimatedMinutes:  Math.ceil((cells.length * (SERPAPI_DELAY_MS + resultsPerCell * BATCH_DELAY_MS)) / 60_000),
    cells: cells.map(c => ({
      pieceType:   c.pieceTypeId,
      institution: c.institutionId,
      career:      c.career,
      query:       c.query,
      priority:    c.priority,
    })),
  };
}
