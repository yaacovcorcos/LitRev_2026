ALTER TABLE "AgentRun"
ADD COLUMN "lastActivityAt" TIMESTAMP(3);

UPDATE "AgentRun"
SET "lastActivityAt" = COALESCE("completedAt", "startedAt")
WHERE "lastActivityAt" IS NULL;

ALTER TABLE "AgentRun"
ALTER COLUMN "lastActivityAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lastActivityAt" SET NOT NULL;

CREATE INDEX "AgentRun_conversationId_lastActivityAt_idx"
ON "AgentRun"("conversationId", "lastActivityAt");
