-- Ensure pgvector extension exists for vector index operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Restore semantic ANN index dropped by legacy migration sequence
CREATE INDEX IF NOT EXISTS "MemoryEmbedding_embedding_hnsw_idx"
  ON "MemoryEmbedding" USING hnsw ("embedding" vector_cosine_ops);
