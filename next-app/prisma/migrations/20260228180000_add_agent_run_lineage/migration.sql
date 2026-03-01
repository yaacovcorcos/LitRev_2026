-- Add parent/root lineage fields for agent run trees
ALTER TABLE "AgentRun"
  ADD COLUMN IF NOT EXISTS "parentRunId" TEXT,
  ADD COLUMN IF NOT EXISTS "rootRunId" TEXT;

-- Self-reference for run lineage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AgentRun_parentRunId_fkey'
  ) THEN
    ALTER TABLE "AgentRun"
      ADD CONSTRAINT "AgentRun_parentRunId_fkey"
      FOREIGN KEY ("parentRunId") REFERENCES "AgentRun"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Query performance for lineage + timeline traversal
CREATE INDEX IF NOT EXISTS "AgentRun_conversationId_startedAt_idx"
  ON "AgentRun"("conversationId", "startedAt");

CREATE INDEX IF NOT EXISTS "AgentRun_parentRunId_startedAt_idx"
  ON "AgentRun"("parentRunId", "startedAt");

CREATE INDEX IF NOT EXISTS "AgentRun_rootRunId_startedAt_idx"
  ON "AgentRun"("rootRunId", "startedAt");

-- Enforce deterministic event ordering uniqueness per run
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RunEvent_runId_sequence_key'
  ) THEN
    ALTER TABLE "RunEvent"
      ADD CONSTRAINT "RunEvent_runId_sequence_key" UNIQUE ("runId", "sequence");
  END IF;
END $$;
