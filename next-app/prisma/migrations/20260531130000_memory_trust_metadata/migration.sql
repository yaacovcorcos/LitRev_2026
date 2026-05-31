-- Add explicit memory trust/provenance metadata and per-item retrieval audit rows.

ALTER TABLE "UserMemory" ALTER COLUMN "source" SET DEFAULT 'explicit_user';
ALTER TABLE "ProjectMemory" ALTER COLUMN "source" SET DEFAULT 'explicit_user';

ALTER TABLE "UserMemory"
  ADD COLUMN "authority" TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN "polarity" TEXT NOT NULL DEFAULT 'affirming',
  ADD COLUMN "sourceRefType" TEXT,
  ADD COLUMN "sourceRefId" TEXT,
  ADD COLUMN "embeddingStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "lastUsedAt" TIMESTAMP(3);

ALTER TABLE "ProjectMemory"
  ADD COLUMN "key" TEXT,
  ADD COLUMN "authority" TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN "polarity" TEXT NOT NULL DEFAULT 'affirming',
  ADD COLUMN "sourceRefType" TEXT,
  ADD COLUMN "sourceRefId" TEXT,
  ADD COLUMN "embeddingStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "lastUsedAt" TIMESTAMP(3),
  ADD COLUMN "importanceRank" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "StudyMemory"
  ADD COLUMN "key" TEXT,
  ADD COLUMN "authority" TEXT NOT NULL DEFAULT 'inferred',
  ADD COLUMN "polarity" TEXT NOT NULL DEFAULT 'affirming',
  ADD COLUMN "sourceRefType" TEXT,
  ADD COLUMN "sourceRefId" TEXT,
  ADD COLUMN "locator" JSONB,
  ADD COLUMN "embeddingStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "lastUsedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "UserMemory"
SET
  "source" = CASE
    WHEN "source" = 'explicit' THEN 'explicit_user'
    WHEN "source" = 'extracted' THEN 'conversation_extraction'
    WHEN "source" = 'sync' THEN 'system_sync'
    WHEN "source" = 'decision' THEN 'artifact_accept'
    ELSE "source"
  END,
  "authority" = CASE
    WHEN 'ai-proposed' = ANY("tags") THEN 'confirmed'
    WHEN "source" = 'extracted' THEN 'inferred'
    ELSE 'confirmed'
  END;

UPDATE "ProjectMemory"
SET
  "key" = (
    SELECT substring(tag FROM 12)
    FROM unnest("ProjectMemory"."tags") AS tag
    WHERE tag LIKE 'memory-key:%'
    LIMIT 1
  )
WHERE EXISTS (
  SELECT 1
  FROM unnest("ProjectMemory"."tags") AS tag
  WHERE tag LIKE 'memory-key:%'
);

UPDATE "StudyMemory"
SET
  "key" = (
    SELECT substring(tag FROM 12)
    FROM unnest("StudyMemory"."tags") AS tag
    WHERE tag LIKE 'memory-key:%'
    LIMIT 1
  )
WHERE EXISTS (
  SELECT 1
  FROM unnest("StudyMemory"."tags") AS tag
  WHERE tag LIKE 'memory-key:%'
);

UPDATE "ProjectMemory"
SET
  "source" = CASE
    WHEN EXISTS (SELECT 1 FROM unnest("ProjectMemory"."tags") AS tag WHERE tag LIKE 'protocol-sync:%') THEN 'protocol_sync'
    WHEN 'conversation-extracted' = ANY("tags") THEN 'conversation_extraction'
    WHEN 'artifact-decision' = ANY("tags") THEN 'artifact_accept'
    WHEN 'ai-proposed' = ANY("tags") THEN 'artifact_accept'
    WHEN "source" = 'explicit' THEN 'explicit_user'
    WHEN "source" = 'extracted' THEN 'conversation_extraction'
    WHEN "source" = 'sync' THEN 'system_sync'
    WHEN "source" = 'decision' THEN 'explicit_user'
    ELSE "source"
  END,
  "authority" = CASE
    WHEN EXISTS (SELECT 1 FROM unnest("ProjectMemory"."tags") AS tag WHERE tag LIKE 'protocol-sync:%') THEN 'canonical'
    WHEN 'conversation-extracted' = ANY("tags") THEN 'inferred'
    ELSE 'confirmed'
  END,
  "importanceRank" = CASE "importance"
    WHEN 'critical' THEN 30
    WHEN 'important' THEN 20
    ELSE 10
  END;

UPDATE "StudyMemory"
SET
  "source" = CASE
    WHEN 'artifact-decision' = ANY("tags") THEN 'artifact_accept'
    WHEN 'deep-analysis' = ANY("tags") THEN 'deep_analysis'
    WHEN "source" = 'user_input' THEN 'explicit_user'
    ELSE "source"
  END,
  "authority" = CASE
    WHEN "source" = 'user_input' THEN 'confirmed'
    ELSE 'inferred'
  END;

CREATE TABLE "MemoryRetrievalItem" (
  "id" TEXT NOT NULL,
  "retrievalId" TEXT NOT NULL,
  "memoryType" TEXT NOT NULL,
  "memoryId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "finalScore" DOUBLE PRECISION NOT NULL,
  "lexicalScore" DOUBLE PRECISION,
  "semanticScore" DOUBLE PRECISION,
  "deterministic" BOOLEAN NOT NULL DEFAULT false,
  "tokenEstimate" INTEGER NOT NULL,
  "source" TEXT,
  "authority" TEXT,
  "usedInAnswer" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemoryRetrievalItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MemoryRetrievalItem"
  ADD CONSTRAINT "MemoryRetrievalItem_retrievalId_fkey"
  FOREIGN KEY ("retrievalId") REFERENCES "MemoryRetrieval"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "UserMemory_userId_authority_status_idx" ON "UserMemory"("userId", "authority", "status");
CREATE INDEX "UserMemory_userId_embeddingStatus_idx" ON "UserMemory"("userId", "embeddingStatus");

CREATE INDEX "ProjectMemory_projectId_importanceRank_idx" ON "ProjectMemory"("projectId", "importanceRank");
CREATE INDEX "ProjectMemory_projectId_key_idx" ON "ProjectMemory"("projectId", "key");
CREATE INDEX "ProjectMemory_projectId_authority_status_idx" ON "ProjectMemory"("projectId", "authority", "status");
CREATE INDEX "ProjectMemory_projectId_source_idx" ON "ProjectMemory"("projectId", "source");
CREATE INDEX "ProjectMemory_projectId_embeddingStatus_idx" ON "ProjectMemory"("projectId", "embeddingStatus");

CREATE INDEX "StudyMemory_projectId_key_idx" ON "StudyMemory"("projectId", "key");
CREATE INDEX "StudyMemory_projectId_authority_status_idx" ON "StudyMemory"("projectId", "authority", "status");
CREATE INDEX "StudyMemory_projectId_source_idx" ON "StudyMemory"("projectId", "source");
CREATE INDEX "StudyMemory_projectId_embeddingStatus_idx" ON "StudyMemory"("projectId", "embeddingStatus");

CREATE INDEX "MemoryRetrievalItem_retrievalId_idx" ON "MemoryRetrievalItem"("retrievalId");
CREATE INDEX "MemoryRetrievalItem_memoryType_memoryId_idx" ON "MemoryRetrievalItem"("memoryType", "memoryId");
CREATE INDEX "MemoryRetrievalItem_source_idx" ON "MemoryRetrievalItem"("source");
CREATE INDEX "MemoryRetrievalItem_authority_idx" ON "MemoryRetrievalItem"("authority");
