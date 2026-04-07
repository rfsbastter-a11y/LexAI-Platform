/**
 * CorpusService — Serviço unificado de corpus jurídico público
 *
 * Responsabilidades:
 *  1. scrapeUrl()             — baixa e extrai texto de uma URL (PDF/DOCX/HTML)
 *  2. ingestCorpusDocument()  — classifica + salva + embeds (fire-and-forget safe)
 *  3. searchCorpus()          — busca semântica (wrapper do corpusRetrieval)
 *
 * Restrições:
 *  - Max 2 scrapes simultâneos (semáforo interno)
 *  - 1.5s entre batches
 *  - 10s timeout por URL
 *  - JusBrasil / Migalhas: guarda só snippet, nunca baixa HTML completo
 */

import crypto from "crypto";
import { pool } from "../db";
import { embeddingService } from "./embeddingService";

// ── domínios bloqueados para scraping completo (guarda apenas snippet) ──
const SNIPPET_ONLY_DOMAINS = ["jusbrasil.com.br", "migalhas.com.br"];

// ── semáforo para max 2 scrapes simultâneos ──
let activeScrapes = 0;
const MAX_CONCURRENT = 2;
const BATCH_DELAY_MS = 1500;
const SCRAPE_TIMEOUT_MS = 10_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isDomainBlocked(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return SNIPPET_ONLY_DOMAINS.some((d) => hostname.endsWith(d));
  } catch {
    return false;
  }
}

export interface ScrapeResult {
  text: string;
  fullContent: string | null;
  snippetOnly: boolean;
}

/**
 * Baixa e extrai texto de uma URL.
 * Retorna snippet para domínios bloqueados.
 * Limita a 10s de timeout e respeita o semáforo de concorrência.
 */
export async function scrapeUrl(url: string, snippet?: string): Promise<ScrapeResult | null> {
  if (isDomainBlocked(url)) {
    return { text: snippet || "", fullContent: null, snippetOnly: true };
  }

  // aguarda vez no semáforo
  while (activeScrapes >= MAX_CONCURRENT) {
    await sleep(200);
  }
  activeScrapes++;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LexAI/1.0 (legal research bot; contact: admin@lexai.com.br)",
        Accept: "application/pdf,text/html,application/octet-stream,*/*",
      },
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    const buffer = Buffer.from(await res.arrayBuffer());

    if (buffer.length > 10 * 1024 * 1024) return null; // >10MB — ignora

    let text = "";

    if (contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      text = parsed.text || "";
    } else if (
      contentType.includes("wordprocessingml") ||
      url.toLowerCase().endsWith(".docx")
    ) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || "";
    } else {
      // HTML — strip tags
      text = buffer
        .toString("utf-8")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    text = text.replace(/\s+/g, " ").trim();
    if (text.length < 200) return null;

    return {
      text: text.substring(0, 2000),      // preview para embedding
      fullContent: text.substring(0, 50_000), // full para armazenar
      snippetOnly: false,
    };
  } catch {
    return null;
  } finally {
    activeScrapes--;
  }
}

export interface IngestParams {
  url: string;
  snippet?: string;       // texto do snippet (SerpAPI / search result)
  title?: string;
  docType?: string;       // tipo de peça inferido da query
  career?: string;        // carreira AGU inferida
  institution?: string;
  tribunal?: string;
  legalArea?: string;
  qualityScore?: number;
}

/**
 * Pipeline completo: scrape → hash → dedup → classify → salva → embed.
 * Seguro para fire-and-forget (nunca lança exceção ao chamador).
 */
export async function ingestCorpusDocument(params: IngestParams): Promise<void> {
  try {
    const {
      url,
      snippet = "",
      title,
      docType = "peticao",
      career = "geral",
      institution,
      tribunal,
      legalArea,
      qualityScore = 5,
    } = params;

    // 1. Scrape
    const scraped = await scrapeUrl(url, snippet);
    const rawText = scraped?.text || snippet;
    if (!rawText || rawText.trim().length < 100) return;

    // 2. Hash para deduplicação
    const hash = crypto.createHash("sha256").update(rawText.trim()).digest("hex");
    const alreadyExists = await pool.query(
      `SELECT id FROM legal_corpus_documents WHERE hash = $1 OR source_url = $2 LIMIT 1`,
      [hash, url]
    );
    if (alreadyExists.rows.length > 0) return;

    // 3. Classificação leve via regex (sem custo de API)
    const detectedDocType = detectDocType(rawText) || docType;
    const detectedLegalArea = detectLegalArea(rawText) || legalArea || "geral";
    const detectedTribunal = detectTribunal(rawText) || tribunal;
    const detectedInstitution = detectInstitution(rawText) || institution;

    // 4. Salva no banco
    const insert = await pool.query(
      `INSERT INTO legal_corpus_documents
         (career, source, doc_type, title, content, source_url, hash,
          institution, tribunal, legal_area, quality_score,
          scraped_at, full_content, scrape_failed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, FALSE)
       RETURNING id`,
      [
        career,
        "serpapi_auto",
        detectedDocType,
        title || url,
        rawText.substring(0, 8000),
        url,
        hash,
        detectedInstitution || null,
        detectedTribunal || null,
        detectedLegalArea,
        qualityScore,
        scraped?.fullContent || null,
      ]
    );

    const docId = insert.rows[0]?.id;
    if (!docId) return;

    // 5. Gera embedding e salva (fire-and-forget dentro do fire-and-forget)
    try {
      const embedding = await embeddingService.embedText(rawText);
      const embeddingLiteral = `[${embedding.join(",")}]`;
      await pool.query(
        `INSERT INTO corpus_embeddings (corpus_doc_id, doc_type, content_preview, embedding)
         VALUES ($1, $2, $3, $4::vector)
         ON CONFLICT (corpus_doc_id) DO NOTHING`,
        [docId, detectedDocType, rawText.substring(0, 500), embeddingLiteral]
      );
      console.log(`[Corpus] Ingested doc ${docId} — ${detectedDocType} (${url.substring(0, 60)})`);
    } catch (embErr: any) {
      console.warn(`[Corpus] Embedding failed for doc ${docId}:`, embErr.message);
    }
  } catch (err: any) {
    // nunca propaga — fire-and-forget
    console.warn("[Corpus] ingestCorpusDocument failed silently:", err.message);
  }
}

/**
 * Wrapper para busca semântica no corpus.
 * Delega para corpusRetrievalService.
 */
export async function searchCorpus(params: {
  queryText: string;
  pieceType?: string;
  topK?: number;
  minQuality?: number;
}) {
  try {
    const { corpusRetrievalService } = await import("./corpusRetrieval");
    return await corpusRetrievalService.retrieveSimilarDocuments(params);
  } catch {
    return [];
  }
}

// ── Helpers de classificação por regex (sem custo de API) ──

function detectDocType(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bcontesta[çc][aã]o\b/.test(t)) return "contestacao";
  if (/\brecurso\s+ordinário\b/.test(t)) return "recurso_ordinario";
  if (/\bapela[çc][aã]o\b/.test(t)) return "apelacao";
  if (/\bagravo\b/.test(t)) return "agravo";
  if (/\bpeti[çc][aã]o\s+inicial\b/.test(t)) return "peticao_inicial";
  if (/\bmemorial\b/.test(t)) return "memorial";
  if (/\bparecer\b/.test(t)) return "parecer";
  if (/\bnota\s+t[eé]cnica\b/.test(t)) return "nota_tecnica";
  if (/\bembargos\b/.test(t)) return "embargos";
  if (/\bmandado\s+de\s+seguran[çc]a\b/.test(t)) return "mandado_seguranca";
  if (/\bhabeas\s+corpus\b/.test(t)) return "habeas_corpus";
  if (/\bimpugna[çc][aã]o\b/.test(t)) return "impugnacao";
  return null;
}

function detectLegalArea(text: string): string | null {
  const t = text.toLowerCase();
  if (/\btribut[aá]r\w+\b/.test(t)) return "tributario";
  if (/\bprevidenci[aá]r\w+\b/.test(t)) return "previdenciario";
  if (/\bambiental\b/.test(t)) return "ambiental";
  if (/\badministrativ\w+\b/.test(t)) return "administrativo";
  if (/\btrabalhist\w+\b/.test(t)) return "trabalhista";
  if (/\bconsumidor\b/.test(t)) return "consumidor";
  if (/\bpenal\b|\bcriminal\b/.test(t)) return "penal";
  if (/\bcivil\b/.test(t)) return "civil";
  return null;
}

function detectTribunal(text: string): string | null {
  const t = text.toUpperCase();
  if (/\bSTF\b/.test(t)) return "STF";
  if (/\bSTJ\b/.test(t)) return "STJ";
  if (/\bTST\b/.test(t)) return "TST";
  if (/\bTRF[- ]?1\b/.test(t)) return "TRF1";
  if (/\bTRF[- ]?2\b/.test(t)) return "TRF2";
  if (/\bTRF[- ]?3\b/.test(t)) return "TRF3";
  if (/\bTRF[- ]?4\b/.test(t)) return "TRF4";
  if (/\bTRF[- ]?5\b/.test(t)) return "TRF5";
  if (/\bTRF[- ]?6\b/.test(t)) return "TRF6";
  if (/\bAGU\b/.test(t)) return "AGU";
  if (/\bPGFN\b/.test(t)) return "PGFN";
  if (/\bPGBC\b/.test(t)) return "PGBC";
  return null;
}

function detectInstitution(text: string): string | null {
  const t = text.toUpperCase();
  if (/\bAGU\b/.test(t)) return "AGU";
  if (/\bPGFN\b/.test(t)) return "PGFN";
  if (/\bPGBC\b/.test(t) || /\bBANCO CENTRAL\b/.test(t)) return "PGBC";
  if (/\bINSS\b/.test(t)) return "INSS";
  if (/\bCADE\b/.test(t)) return "CADE";
  if (/\bANEEL\b/.test(t)) return "ANEEL";
  if (/\bANP\b/.test(t)) return "ANP";
  if (/\bANVISA\b/.test(t)) return "ANVISA";
  if (/\bIBAMA\b/.test(t)) return "IBAMA";
  if (/\bUNIÃO FEDERAL\b/.test(t) || /\bFAZENDA NACIONAL\b/.test(t)) return "União Federal";
  return null;
}
