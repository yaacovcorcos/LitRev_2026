-- CreateTable
CREATE TABLE "StudyProcessingJob" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "fileAssetId" TEXT,
    "phase" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "requestSource" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudyProcessingJob_studyId_phase_key" ON "StudyProcessingJob"("studyId", "phase");

-- CreateIndex
CREATE INDEX "StudyProcessingJob_projectId_state_priority_requestedAt_idx" ON "StudyProcessingJob"("projectId", "state", "priority", "requestedAt");

-- CreateIndex
CREATE INDEX "StudyProcessingJob_leaseExpiresAt_idx" ON "StudyProcessingJob"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "StudyProcessingJob_studyId_idx" ON "StudyProcessingJob"("studyId");

-- AddForeignKey
ALTER TABLE "StudyProcessingJob"
ADD CONSTRAINT "StudyProcessingJob_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyProcessingJob"
ADD CONSTRAINT "StudyProcessingJob_studyId_fkey"
FOREIGN KEY ("studyId") REFERENCES "Study"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyProcessingJob"
ADD CONSTRAINT "StudyProcessingJob_fileAssetId_fkey"
FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
