/**
 * Harvey Technique: Semantic RAG with pgvector
 *
 * Generates OpenAI embeddings for approved legal pieces and
 * retrieves semantically similar ones at generation time.
 *
 * Uses text-embedding-3-small (1536 dims) — cost: ~$0.02/1M tokens.
 * Average piece snippet (2000 chars ≈ 500 tokens) = ~$0.00001 per embed.
 */

import OpenAI from "openai";
import { pool } from "../db";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const SIMILARITY_THRESHOLD = 0.78;
const EMBED_CONTENT_MAX_CHARS = 2000; // embed only first 2000 chars — cost-effective

export interface SimilarPiece {
  pieceId: number | null;
  pieceType: string;
  contentText: string;
  similarity: number;
}

interface UpsertParams {
  tenantId: number;
  pieceId?: number;
  pieceType: string;
  contentText: string;
}

interface RetrieveParams {
  tenantId: number;
  queryText: string;
  pieceType: string;
  topK?: number;
  similarityThreshold?: number;
}

class EmbeddingService {
  /**
   * Generate a vector embedding for the given text.
   * Strips HTML and truncates to EMBED_CONTENT_MAX_CHARS before embedding.
   */
  async embedText(text: string): Promise<number[]> {
    const clean = text
      .replace(/<[^>]+>/g, " ")        // strip HTML tags
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, EMBED_CONTENT_MAX_CHARS);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: clean,
      dimensions: EMBEDDING_DIMS,
    });

    return response.data[0].embedding;
  }

  /**
   * Store or update the embedding for a generated piece.
   * Safe to call fire-and-forget (void).
   */
  async upsertPieceEmbedding(params: UpsertParams): Promise<void> {
    const { tenantId, pieceId, pieceType, contentText } = params;

    if (!contentText || contentText.trim().length < 100) return;

    const embedding = await this.embedText(contentText);
    const embeddingLiteral = `[${embedding.join(",")}]`;

    // Upsert: if piece_id already exists, replace the embedding
    if (pieceId) {
      await pool.query(
        `INSERT INTO piece_embeddings (tenant_id, piece_id, piece_type, content_text, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)
         ON CONFLICT DO NOTHING`,
        [tenantId, pieceId, pieceType, contentText.substring(0, 8000), embeddingLiteral]
      );
    } else {
      await pool.query(
        `INSERT INTO piece_embeddings (tenant_id, piece_type, content_text, embedding)
         VALUES ($1, $2, $3, $4::vector)`,
        [tenantId, pieceType, contentText.substring(0, 8000), embeddingLiteral]
      );
    }
  }

  /**
   * Retrieve top-K semantically similar approved pieces for a given query.
   * Uses pgvector cosine distance operator (<=>) for efficient ANN search.
   */
  async retrieveSimilarPieces(params: RetrieveParams): Promise<SimilarPiece[]> {
    const {
      tenantId,
      queryText,
      pieceType,
      topK = 3,
      similarityThreshold = SIMILARITY_THRESHOLD,
    } = params;

    if (!queryText || queryText.trim().length < 10) return [];

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embedText(queryText);
    } catch (err: any) {
      console.warn("[RAG] Failed to embed query:", err.message);
      return [];
    }

    const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

    // Cosine similarity: 1 - cosine_distance
    // Filter by tenant (multi-tenant isolation) + piece type
    const result = await pool.query(
      `SELECT
         pe.piece_id,
         pe.piece_type,
         pe.content_text,
         1 - (pe.embedding <=> $1::vector) AS similarity
       FROM piece_embeddings pe
       JOIN generated_pieces gp ON gp.id = pe.piece_id
       WHERE pe.tenant_id = $2
         AND pe.piece_type = $3
         AND gp.human_approved = TRUE
         AND 1 - (pe.embedding <=> $1::vector) > $4
       ORDER BY pe.embedding <=> $1::vector
       LIMIT $5`,
      [embeddingLiteral, tenantId, pieceType, similarityThreshold, topK]
    );

    return result.rows.map(row => ({
      pieceId: row.piece_id,
      pieceType: row.piece_type,
      contentText: row.content_text,
      similarity: parseFloat(row.similarity),
    }));
  }

  /**
   * Index an approved piece by its ID.
   * Called after POST /api/studio/pieces/:id/approve.
   */
  async upsertPieceEmbeddingForApprovedPiece(pieceId: number, tenantId: number): Promise<void> {
    const result = await pool.query(
      `SELECT piece_type, content_text, content_html FROM generated_pieces WHERE id = $1`,
      [pieceId]
    );

    if (result.rows.length === 0) return;

    const { piece_type, content_text, content_html } = result.rows[0];
    const text = content_text || (content_html as string).replace(/<[^>]+>/g, " ");

    await this.upsertPieceEmbedding({
      tenantId,
      pieceId,
      pieceType: piece_type,
      contentText: text,
    });
  }

  /**
   * Backfill: index all existing approved pieces for a tenant.
   * Rate-limited to avoid hitting OpenAI embedding API limits (3000 req/min on tier 1).
   */
  async indexAllApprovedPieces(tenantId: number, delayMs = 50): Promise<{ indexed: number; skipped: number }> {
    const pieces = await pool.query(
      `SELECT gp.id, gp.piece_type, gp.content_text, gp.content_html
       FROM generated_pieces gp
       LEFT JOIN piece_embeddings pe ON pe.piece_id = gp.id
       WHERE gp.tenant_id = $1
         AND gp.human_approved = TRUE
         AND pe.id IS NULL`,
      [tenantId]
    );

    let indexed = 0;
    let skipped = 0;

    for (const piece of pieces.rows) {
      const text = piece.content_text || (piece.content_html as string).replace(/<[^>]+>/g, " ");
      if (!text || text.trim().length < 100) { skipped++; continue; }

      try {
        await this.upsertPieceEmbedding({
          tenantId,
          pieceId: piece.id,
          pieceType: piece.piece_type,
          contentText: text,
        });
        indexed++;
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      } catch (err: any) {
        console.error(`[RAG Backfill] Failed piece ${piece.id}:`, err.message);
        skipped++;
      }
    }

    return { indexed, skipped };
  }
}

export const embeddingService = new EmbeddingService();
