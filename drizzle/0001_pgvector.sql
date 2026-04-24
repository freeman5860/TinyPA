-- Manual migration for pgvector support.
-- Run order on any environment (local + Neon):
--   1. psql "$DATABASE_URL" -f drizzle/0001_pgvector.sql   (enables extension)
--   2. pnpm db:push                                         (adds embedding column)
--   3. psql "$DATABASE_URL" -f drizzle/0001_pgvector.sql   (rerun for HNSW index)
--
-- The file is idempotent — safe to run multiple times. The index creation
-- depends on the embedding column existing, so step 1 no-ops the CREATE INDEX
-- until step 3.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'items' AND column_name = 'embedding'
  ) THEN
    CREATE INDEX IF NOT EXISTS items_note_embedding_idx
      ON items USING hnsw (embedding vector_cosine_ops)
      WHERE type = 'note' AND embedding IS NOT NULL;
  END IF;
END
$$;
