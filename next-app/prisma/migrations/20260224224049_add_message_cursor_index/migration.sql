-- DropIndex
DROP INDEX "MemoryEmbedding_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "ProjectMemory_projectId_pinned_idx";

-- DropIndex
DROP INDEX "StudyMemory_projectId_pinned_idx";

-- DropIndex
DROP INDEX "UserMemory_userId_pinned_idx";

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_createdAt_id_idx" ON "AIMessage"("conversationId", "createdAt", "id");
