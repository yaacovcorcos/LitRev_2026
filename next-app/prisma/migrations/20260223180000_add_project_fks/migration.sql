-- Add foreign key constraints from 6 models to Project.
-- Orphan rows (projectId not in Project) are cleaned first so the FK can be created safely.
-- Each ADD CONSTRAINT is guarded so partial re-runs won't fail.

-- 1. AIConversation → Project (CASCADE)
DELETE FROM "AIConversation"
WHERE "projectId" IS NOT NULL
  AND "projectId" NOT IN (SELECT "id" FROM "Project");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AIConversation_projectId_fkey'
  ) THEN
    ALTER TABLE "AIConversation"
      ADD CONSTRAINT "AIConversation_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 2. AIUsage → Project (SET NULL — preserve analytics after project deletion)
UPDATE "AIUsage"
SET "projectId" = NULL
WHERE "projectId" IS NOT NULL
  AND "projectId" NOT IN (SELECT "id" FROM "Project");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AIUsage_projectId_fkey'
  ) THEN
    ALTER TABLE "AIUsage"
      ADD CONSTRAINT "AIUsage_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. AgentRun → Project (CASCADE)
DELETE FROM "AgentRun"
WHERE "projectId" NOT IN (SELECT "id" FROM "Project");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgentRun_projectId_fkey'
  ) THEN
    ALTER TABLE "AgentRun"
      ADD CONSTRAINT "AgentRun_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. MemoryRetrieval → Project (CASCADE)
DELETE FROM "MemoryRetrieval"
WHERE "projectId" IS NOT NULL
  AND "projectId" NOT IN (SELECT "id" FROM "Project");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MemoryRetrieval_projectId_fkey'
  ) THEN
    ALTER TABLE "MemoryRetrieval"
      ADD CONSTRAINT "MemoryRetrieval_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. MemoryEmbedding → Project (CASCADE)
DELETE FROM "MemoryEmbedding"
WHERE "projectId" IS NOT NULL
  AND "projectId" NOT IN (SELECT "id" FROM "Project");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MemoryEmbedding_projectId_fkey'
  ) THEN
    ALTER TABLE "MemoryEmbedding"
      ADD CONSTRAINT "MemoryEmbedding_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 6. AutonomyConfig → Project (CASCADE)
DELETE FROM "AutonomyConfig"
WHERE "projectId" IS NOT NULL
  AND "projectId" NOT IN (SELECT "id" FROM "Project");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutonomyConfig_projectId_fkey'
  ) THEN
    ALTER TABLE "AutonomyConfig"
      ADD CONSTRAINT "AutonomyConfig_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
