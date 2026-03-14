CREATE TABLE "RunCheckpoint" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "nextStep" TEXT NOT NULL,
    "seedVersion" INTEGER NOT NULL DEFAULT 1,
    "seed" JSONB NOT NULL,
    "sourceEventSequence" INTEGER NOT NULL,
    "sourceArtifactId" TEXT,
    "invalidatedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunCheckpoint_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RunCheckpoint"
ADD CONSTRAINT "RunCheckpoint_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "AgentRun"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RunCheckpoint_runId_sourceEventSequence_key"
ON "RunCheckpoint"("runId", "sourceEventSequence");

CREATE INDEX "RunCheckpoint_runId_status_sourceEventSequence_idx"
ON "RunCheckpoint"("runId", "status", "sourceEventSequence" DESC);

CREATE INDEX "RunCheckpoint_conversationId_status_sourceEventSequence_idx"
ON "RunCheckpoint"("conversationId", "status", "sourceEventSequence" DESC);

CREATE INDEX "RunCheckpoint_sourceArtifactId_idx"
ON "RunCheckpoint"("sourceArtifactId");
