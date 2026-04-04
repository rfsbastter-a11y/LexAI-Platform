import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id serial PRIMARY KEY,
      tenant_id integer NOT NULL REFERENCES tenants(id),
      jid text NOT NULL,
      contact_name text,
      message_text text NOT NULL,
      actor_type text NOT NULL DEFAULT 'unknown',
      intent_type text NOT NULL DEFAULT 'unknown',
      status text NOT NULL DEFAULT 'received',
      idempotency_key text NOT NULL,
      current_task text,
      requested_action text,
      requested_args jsonb,
      plan jsonb,
      sources_used jsonb,
      verification jsonb,
      response_preview text,
      error_code text,
      error_message text,
      metadata jsonb,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS agent_runs_tenant_jid_idx
      ON agent_runs (tenant_id, jid)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS agent_runs_idempotency_key_idx
      ON agent_runs (idempotency_key)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_steps (
      id serial PRIMARY KEY,
      run_id integer NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      tenant_id integer NOT NULL REFERENCES tenants(id),
      step_type text NOT NULL,
      status text NOT NULL DEFAULT 'started',
      input jsonb,
      output jsonb,
      started_at timestamp NOT NULL DEFAULT now(),
      finished_at timestamp
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS agent_steps_run_id_idx
      ON agent_steps (run_id)
  `);

  console.log("Secretary agent tables ensured successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to ensure secretary agent tables:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
