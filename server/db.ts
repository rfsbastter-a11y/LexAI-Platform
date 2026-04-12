import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.query("SELECT current_database(), inet_server_port()").then(async res => {
  const row = res.rows[0];
  console.log(`[DB] Connected to database: "${row.current_database}" on port ${row.inet_server_port || "default"} (env: ${process.env.NODE_ENV || "development"})`);

  try {
    const colCheck = await pool.query(
      "SELECT data_type FROM information_schema.columns WHERE table_name = 'meeting_utterances' AND column_name = 'timestamp_ms'"
    );
    if (colCheck.rows.length > 0 && colCheck.rows[0].data_type !== "bigint") {
      console.log("[DB Migration] Upgrading meeting_utterances.timestamp_ms to bigint...");
      await pool.query("ALTER TABLE meeting_utterances ALTER COLUMN timestamp_ms TYPE bigint USING timestamp_ms::bigint");
      console.log("[DB Migration] timestamp_ms upgraded to bigint successfully.");
    }
  } catch (migErr: any) {
    if (!migErr.message?.includes("does not exist")) {
      console.error("[DB Migration] timestamp_ms check failed:", migErr.message);
    }
  }

  try {
    const paCol = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'secretary_actions' AND column_name = 'pending_action'"
    );
    if (paCol.rows.length === 0) {
      console.log("[DB Migration] Adding pending_action column to secretary_actions...");
      await pool.query("ALTER TABLE secretary_actions ADD COLUMN IF NOT EXISTS pending_action jsonb");
      console.log("[DB Migration] pending_action column added successfully.");
    }
  } catch (migErr: any) {
    console.error("[DB Migration] pending_action column migration failed:", migErr.message);
  }

  // ============================================================
  // HARVEY TECHNIQUES MIGRATIONS
  // ============================================================

  // 1. pgvector extension
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    console.log("[DB Migration] pgvector extension ready.");
  } catch (migErr: any) {
    console.warn("[DB Migration] pgvector not available (install pgvector on the server):", migErr.message);
  }

  // 2. piece_embeddings table for semantic RAG
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS piece_embeddings (
        id           SERIAL PRIMARY KEY,
        tenant_id    INTEGER NOT NULL REFERENCES tenants(id),
        piece_id     INTEGER REFERENCES generated_pieces(id) ON DELETE CASCADE,
        piece_type   TEXT NOT NULL,
        content_text TEXT NOT NULL,
        embedding    vector(1536),
        created_at   TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS piece_embeddings_vector_idx
      ON piece_embeddings USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS piece_embeddings_tenant_type_idx
      ON piece_embeddings (tenant_id, piece_type)
    `);
    console.log("[DB Migration] piece_embeddings table ready.");
  } catch (migErr: any) {
    console.warn("[DB Migration] piece_embeddings migration skipped (pgvector may not be installed):", migErr.message);
  }

  // 3. legal_corpus_documents table (public AGU/PGFN/PGBC corpus)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS legal_corpus_documents (
        id           SERIAL PRIMARY KEY,
        career       TEXT NOT NULL,
        entity       TEXT,
        source       TEXT NOT NULL,
        doc_type     TEXT NOT NULL,
        doc_number   TEXT,
        title        TEXT,
        content      TEXT NOT NULL,
        source_url   TEXT,
        published_at TIMESTAMP,
        hash         TEXT UNIQUE,
        institution  TEXT,
        tribunal     TEXT,
        legal_area   TEXT,
        quality_score INTEGER DEFAULT 5,
        created_at   TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS legal_corpus_career_idx ON legal_corpus_documents (career)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS legal_corpus_doc_type_idx ON legal_corpus_documents (doc_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS legal_corpus_hash_idx ON legal_corpus_documents (hash)`);
    console.log("[DB Migration] legal_corpus_documents table ready.");
  } catch (migErr: any) {
    console.error("[DB Migration] legal_corpus_documents migration failed:", migErr.message);
  }

  // 3a. Extra columns for scraping pipeline
  try {
    await pool.query(`ALTER TABLE legal_corpus_documents ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMP`);
    await pool.query(`ALTER TABLE legal_corpus_documents ADD COLUMN IF NOT EXISTS full_content TEXT`);
    await pool.query(`ALTER TABLE legal_corpus_documents ADD COLUMN IF NOT EXISTS scrape_failed BOOLEAN DEFAULT FALSE`);
    console.log("[DB Migration] legal_corpus_documents scraping columns ready.");
  } catch (migErr: any) {
    console.error("[DB Migration] legal_corpus_documents scraping columns failed:", migErr.message);
  }

  // 3b. corpus_embeddings table (vector index for public corpus)
  try {
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
    console.log("[DB Migration] corpus_embeddings table ready.");
  } catch (migErr: any) {
    console.warn("[DB Migration] corpus_embeddings migration skipped:", migErr.message);
  }

  // 4. Harvey columns on generated_pieces
  try {
    await pool.query(`ALTER TABLE generated_pieces ADD COLUMN IF NOT EXISTS human_approved BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE generated_pieces ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id)`);
    await pool.query(`ALTER TABLE generated_pieces ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP`);
    await pool.query(`ALTER TABLE generated_pieces ADD COLUMN IF NOT EXISTS rag_pieces_used JSONB`);
    console.log("[DB Migration] generated_pieces Harvey columns ready.");
  } catch (migErr: any) {
    console.error("[DB Migration] generated_pieces Harvey columns failed:", migErr.message);
  }

  // 5. Harvey columns on ai_generation_logs
  try {
    await pool.query(`ALTER TABLE ai_generation_logs ADD COLUMN IF NOT EXISTS full_prompt TEXT`);
    await pool.query(`ALTER TABLE ai_generation_logs ADD COLUMN IF NOT EXISTS full_output TEXT`);
    await pool.query(`ALTER TABLE ai_generation_logs ADD COLUMN IF NOT EXISTS rag_context JSONB`);
    await pool.query(`ALTER TABLE ai_generation_logs ADD COLUMN IF NOT EXISTS generated_piece_id INTEGER REFERENCES generated_pieces(id)`);
    console.log("[DB Migration] ai_generation_logs Harvey columns ready.");
  } catch (migErr: any) {
    console.error("[DB Migration] ai_generation_logs Harvey columns failed:", migErr.message);
  }

  // 6. agreement_monthly_statuses — inadimplência mensal por acordo
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agreement_monthly_statuses (
        id           SERIAL PRIMARY KEY,
        agreement_id INTEGER NOT NULL REFERENCES debtor_agreements(id) ON DELETE CASCADE,
        month        TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'pendente',
        created_at   TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at   TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE (agreement_id, month)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS ams_agreement_idx ON agreement_monthly_statuses (agreement_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ams_month_idx ON agreement_monthly_statuses (month)`);
    console.log("[DB Migration] agreement_monthly_statuses table ready.");
  } catch (migErr: any) {
    console.error("[DB Migration] agreement_monthly_statuses migration failed:", migErr.message);
  }

}).catch(err => {
  console.error("[DB] Failed to verify database connection:", err.message);
});

export const db = drizzle(pool, { schema });
