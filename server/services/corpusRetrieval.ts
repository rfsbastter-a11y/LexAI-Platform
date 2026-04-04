/**
 * Harvey Technique: Corpus Retrieval Service
 *
 * Busca semântica no corpus público (peças AGU/PGFN/PGBC/tribunais)
 * para injetar como referência externa no Studio.
 *
 * Complementa o embeddingService (que busca peças do próprio escritório).
 * Ambos são chamados em paralelo na geração para montar o contexto RAG completo.
 */

import { pool } from "../db";
import { embeddingService } from "./embeddingService";

export interface CorpusResult {
  id: number;
  docType: string;
  career: string;
  institution: string | null;
  tribunal: string | null;
  legalArea: string;
  qualityScore: number;
  contentPreview: string;
  similarity: number;
  sourceUrl: string;
}

interface RetrieveParams {
  queryText: string;
  pieceType?: string;
  legalArea?: string;
  topK?: number;
  similarityThreshold?: number;
  minQuality?: number;
}

class CorpusRetrievalService {
  /**
   * Busca documentos do corpus público semanticamente similares à query.
   * Filtra por tipo de peça e área do direito quando fornecidos.
   */
  async retrieveSimilarDocuments(params: RetrieveParams): Promise<CorpusResult[]> {
    const {
      queryText,
      pieceType,
      legalArea,
      topK = 2,
      similarityThreshold = 0.72,
      minQuality = 5,
    } = params;

    if (!queryText || queryText.trim().length < 10) return [];

    let queryEmbedding: number[];
    try {
      queryEmbedding = await embeddingService.embedText(queryText);
    } catch (err: any) {
      console.warn("[CorpusRAG] Failed to embed query:", err.message);
      return [];
    }

    const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

    // Monta filtros dinâmicos
    const conditions: string[] = [
      `1 - (ce.embedding <=> $1::vector) > $2`,
      `lcd.quality_score >= $3`,
    ];
    const values: any[] = [embeddingLiteral, similarityThreshold, minQuality];
    let paramIdx = 4;

    if (pieceType) {
      conditions.push(`ce.doc_type = $${paramIdx}`);
      values.push(pieceType);
      paramIdx++;
    }

    if (legalArea) {
      conditions.push(`lcd.legal_area = $${paramIdx}`);
      values.push(legalArea);
      paramIdx++;
    }

    values.push(topK);

    const query = `
      SELECT
        lcd.id,
        ce.doc_type,
        lcd.career,
        lcd.institution,
        lcd.tribunal,
        lcd.legal_area,
        lcd.quality_score,
        ce.content_preview,
        lcd.source_url,
        1 - (ce.embedding <=> $1::vector) AS similarity
      FROM corpus_embeddings ce
      JOIN legal_corpus_documents lcd ON lcd.id = ce.corpus_doc_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY ce.embedding <=> $1::vector
      LIMIT $${paramIdx}
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows.map(row => ({
        id: row.id,
        docType: row.doc_type,
        career: row.career,
        institution: row.institution,
        tribunal: row.tribunal,
        legalArea: row.legal_area,
        qualityScore: parseFloat(row.quality_score),
        contentPreview: row.content_preview || "",
        similarity: parseFloat(row.similarity),
        sourceUrl: row.source_url,
      }));
    } catch (err: any) {
      // corpus_embeddings pode não ter dados ainda — silencioso
      if (!err.message?.includes("does not exist")) {
        console.warn("[CorpusRAG] Query failed:", err.message);
      }
      return [];
    }
  }

  /**
   * Estatísticas do corpus atual (para admin/monitoramento).
   */
  async getStats(): Promise<{
    totalDocuments: number;
    totalEmbeddings: number;
    byDocType: Record<string, number>;
    byCareer: Record<string, number>;
  }> {
    const [totals, byType, byCareer] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM legal_corpus_documents) AS total_docs,
          (SELECT COUNT(*) FROM corpus_embeddings)      AS total_embeddings
      `),
      pool.query(`
        SELECT doc_type, COUNT(*) AS cnt
        FROM legal_corpus_documents
        GROUP BY doc_type ORDER BY cnt DESC
      `),
      pool.query(`
        SELECT career, COUNT(*) AS cnt
        FROM legal_corpus_documents
        GROUP BY career ORDER BY cnt DESC
      `),
    ]);

    return {
      totalDocuments: parseInt(totals.rows[0]?.total_docs || "0"),
      totalEmbeddings: parseInt(totals.rows[0]?.total_embeddings || "0"),
      byDocType: Object.fromEntries(byType.rows.map(r => [r.doc_type, parseInt(r.cnt)])),
      byCareer: Object.fromEntries(byCareer.rows.map(r => [r.career, parseInt(r.cnt)])),
    };
  }
}

export const corpusRetrievalService = new CorpusRetrievalService();
