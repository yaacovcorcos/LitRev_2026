ALTER TABLE "AgentRun"
ADD COLUMN "runPhase" TEXT NOT NULL DEFAULT 'plan',
ADD COLUMN "phaseEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "AgentRun"
SET
  "runPhase" = CASE
    WHEN "status" = 'paused' THEN 'ask'
    WHEN "status" IN ('completed', 'failed', 'cancelled')
      OR "finalizationState" IN ('in_progress', 'completed', 'failed')
      THEN 'finalize'
    ELSE 'act'
  END,
  "phaseEnteredAt" = CASE
    WHEN "status" = 'paused'
      THEN COALESCE("completedAt", "lastActivityAt", "startedAt")
    WHEN "status" IN ('completed', 'failed', 'cancelled')
      OR "finalizationState" IN ('in_progress', 'completed', 'failed')
      THEN COALESCE("completedAt", "lastActivityAt", "startedAt")
    ELSE COALESCE("lastActivityAt", "startedAt")
  END;
