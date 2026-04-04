/**
 * Extrator de texto para PDF, DOCX e HTML.
 * Usa pdf-parse e mammoth — já instalados no projeto.
 */

import crypto from "crypto";

export interface ExtractedDocument {
  text: string;
  pageCount?: number;
  hash: string; // SHA-256 do texto limpo — usado para deduplicação
  wordCount: number;
  extractedAt: Date;
}

/**
 * Baixa um arquivo de uma URL pública e retorna o buffer.
 * Timeout de 30s, máx 10MB para não travar o worker.
 */
export async function downloadFile(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LexAI-CorpusBot/1.0 (legal research; contact@lexai.com.br)",
        "Accept": "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,*/*",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    const contentLength = parseInt(response.headers.get("content-length") || "0");

    // Skip files larger than 10MB
    if (contentLength > 10 * 1024 * 1024) {
      console.warn(`[Corpus] Skipping large file (${contentLength} bytes): ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      console.warn(`[Corpus] Download timeout: ${url}`);
    }
    return null;
  }
}

/**
 * Extrai texto de um buffer PDF usando pdf-parse.
 */
export async function extractFromPdf(buffer: Buffer): Promise<ExtractedDocument | null> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);

    const rawText = data.text || "";
    const cleanText = cleanExtractedText(rawText);

    if (cleanText.length < 200) return null; // muito curto para ser útil

    return {
      text: cleanText,
      pageCount: data.numpages,
      hash: sha256(cleanText),
      wordCount: cleanText.split(/\s+/).length,
      extractedAt: new Date(),
    };
  } catch (err: any) {
    console.warn("[Corpus] PDF extraction failed:", err.message);
    return null;
  }
}

/**
 * Extrai texto de um buffer DOCX usando mammoth.
 */
export async function extractFromDocx(buffer: Buffer): Promise<ExtractedDocument | null> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });

    const cleanText = cleanExtractedText(result.value || "");
    if (cleanText.length < 200) return null;

    return {
      text: cleanText,
      hash: sha256(cleanText),
      wordCount: cleanText.split(/\s+/).length,
      extractedAt: new Date(),
    };
  } catch (err: any) {
    console.warn("[Corpus] DOCX extraction failed:", err.message);
    return null;
  }
}

/**
 * Extrai texto de HTML (remove tags, preserva estrutura básica).
 */
export function extractFromHtml(html: string): ExtractedDocument | null {
  try {
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');

    const cleanText = cleanExtractedText(text);
    if (cleanText.length < 200) return null;

    return {
      text: cleanText,
      hash: sha256(cleanText),
      wordCount: cleanText.split(/\s+/).length,
      extractedAt: new Date(),
    };
  } catch {
    return null;
  }
}

/**
 * Detecta o tipo de arquivo pelo content-type ou extensão da URL.
 */
export function detectFileType(url: string, contentType: string): "pdf" | "docx" | "html" | "unknown" {
  const lowerUrl = url.toLowerCase();
  const lowerCt = contentType.toLowerCase();

  if (lowerCt.includes("pdf") || lowerUrl.endsWith(".pdf")) return "pdf";
  if (lowerCt.includes("wordprocessingml") || lowerUrl.endsWith(".docx")) return "docx";
  if (lowerCt.includes("msword") || lowerUrl.endsWith(".doc")) return "docx";
  if (lowerCt.includes("html") || lowerUrl.endsWith(".html") || lowerUrl.endsWith(".htm")) return "html";

  return "unknown";
}

/**
 * Pipeline completo: baixar + extrair texto de qualquer URL.
 */
export async function downloadAndExtract(url: string): Promise<ExtractedDocument | null> {
  const downloaded = await downloadFile(url);
  if (!downloaded) return null;

  const { buffer, contentType } = downloaded;
  const fileType = detectFileType(url, contentType);

  switch (fileType) {
    case "pdf":
      return extractFromPdf(buffer);
    case "docx":
      return extractFromDocx(buffer);
    case "html":
      return extractFromHtml(buffer.toString("utf-8"));
    default:
      // Tenta PDF como fallback (muitos .gov.br servem PDF sem Content-Type correto)
      return extractFromPdf(buffer);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/ {3,}/g, " ")       // colapsa múltiplos espaços
    .replace(/\n{4,}/g, "\n\n\n") // máx 3 quebras de linha seguidas
    .trim();
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}
