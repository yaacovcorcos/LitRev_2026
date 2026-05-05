-- CreateTable
CREATE TABLE "DecisionRequestRecord" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "sourceRunId" TEXT NOT NULL,
    "rootRunId" TEXT,
    "conversationId" TEXT,
    "projectId" TEXT,
    "userId" TEXT,
    "studyId" TEXT,
    "decisionBoundaryKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "request" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DecisionRequestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionResolutionRecord" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "sourceRunId" TEXT NOT NULL,
    "resolutionKind" TEXT NOT NULL,
    "resolution" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionResolutionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRequestRecord_sourceRunId_callId_key" ON "DecisionRequestRecord"("sourceRunId", "callId");

-- CreateIndex
CREATE INDEX "DecisionRequestRecord_conversationId_status_createdAt_idx" ON "DecisionRequestRecord"("conversationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DecisionRequestRecord_rootRunId_createdAt_idx" ON "DecisionRequestRecord"("rootRunId", "createdAt");

-- CreateIndex
CREATE INDEX "DecisionRequestRecord_projectId_status_createdAt_idx" ON "DecisionRequestRecord"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DecisionRequestRecord_decisionBoundaryKey_status_idx" ON "DecisionRequestRecord"("decisionBoundaryKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionResolutionRecord_requestId_key" ON "DecisionResolutionRecord"("requestId");

-- CreateIndex
CREATE INDEX "DecisionResolutionRecord_sourceRunId_createdAt_idx" ON "DecisionResolutionRecord"("sourceRunId", "createdAt");

-- CreateIndex
CREATE INDEX "DecisionResolutionRecord_callId_idx" ON "DecisionResolutionRecord"("callId");

-- AddForeignKey
ALTER TABLE "DecisionRequestRecord" ADD CONSTRAINT "DecisionRequestRecord_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionResolutionRecord" ADD CONSTRAINT "DecisionResolutionRecord_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DecisionRequestRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
