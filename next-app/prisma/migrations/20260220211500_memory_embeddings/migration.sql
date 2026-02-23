-- Enable pgvector for semantic memory retrieval
CREATE EXTENSION IF NOT EXISTS vector;

-- Store embeddings for User/Project/Study memory records
CREATE TABLE IF NOT EXISTS "MemoryEmbedding" (
    "id" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "studyId" TEXT,
    "model" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MemoryEmbedding_memoryType_memoryId_model_key"
    ON "MemoryEmbedding"("memoryType", "memoryId", "model");

CREATE INDEX IF NOT EXISTS "MemoryEmbedding_projectId_memoryType_idx"
    ON "MemoryEmbedding"("projectId", "memoryType");

CREATE INDEX IF NOT EXISTS "MemoryEmbedding_userId_memoryType_idx"
    ON "MemoryEmbedding"("userId", "memoryType");

CREATE INDEX IF NOT EXISTS "MemoryEmbedding_studyId_memoryType_idx"
    ON "MemoryEmbedding"("studyId", "memoryType");

CREATE INDEX IF NOT EXISTS "MemoryEmbedding_embedding_hnsw_idx"
    ON "MemoryEmbedding" USING hnsw ("embedding" vector_cosine_ops);
