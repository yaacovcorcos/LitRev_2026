-- CreateTable
CREATE TABLE "ChatUnificationMetric" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "projectId" TEXT,
    "runId" TEXT,
    "conversationId" TEXT,
    "payload" JSONB NOT NULL,
    "clientTimestamp" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatUnificationMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatUnificationMetric_eventId_key" ON "ChatUnificationMetric"("eventId");

-- CreateIndex
CREATE INDEX "ChatUnificationMetric_recordedAt_idx" ON "ChatUnificationMetric"("recordedAt");

-- CreateIndex
CREATE INDEX "ChatUnificationMetric_type_recordedAt_idx" ON "ChatUnificationMetric"("type", "recordedAt");

-- CreateIndex
CREATE INDEX "ChatUnificationMetric_surface_recordedAt_idx" ON "ChatUnificationMetric"("surface", "recordedAt");

-- CreateIndex
CREATE INDEX "ChatUnificationMetric_workspaceId_recordedAt_idx" ON "ChatUnificationMetric"("workspaceId", "recordedAt");

-- CreateIndex
CREATE INDEX "ChatUnificationMetric_runId_recordedAt_idx" ON "ChatUnificationMetric"("runId", "recordedAt");

-- CreateIndex
CREATE INDEX "ChatUnificationMetric_conversationId_recordedAt_idx" ON "ChatUnificationMetric"("conversationId", "recordedAt");

-- CreateIndex
CREATE INDEX "ChatUnificationMetric_projectId_recordedAt_idx" ON "ChatUnificationMetric"("projectId", "recordedAt");

-- AddForeignKey
ALTER TABLE "ChatUnificationMetric" ADD CONSTRAINT "ChatUnificationMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
