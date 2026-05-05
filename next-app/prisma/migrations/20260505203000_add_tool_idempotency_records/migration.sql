CREATE TABLE "ToolIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "callId" TEXT,
    "runId" TEXT,
    "projectId" TEXT,
    "userId" TEXT,
    "studyId" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ToolIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ToolIdempotencyRecord"
ADD CONSTRAINT "ToolIdempotencyRecord_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "AgentRun"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ToolIdempotencyRecord_scopeKey_toolName_fingerprint_key"
ON "ToolIdempotencyRecord"("scopeKey", "toolName", "fingerprint");

CREATE INDEX "ToolIdempotencyRecord_scopeKey_createdAt_idx"
ON "ToolIdempotencyRecord"("scopeKey", "createdAt");

CREATE INDEX "ToolIdempotencyRecord_runId_idx"
ON "ToolIdempotencyRecord"("runId");

CREATE INDEX "ToolIdempotencyRecord_projectId_idx"
ON "ToolIdempotencyRecord"("projectId");

CREATE INDEX "ToolIdempotencyRecord_userId_idx"
ON "ToolIdempotencyRecord"("userId");
