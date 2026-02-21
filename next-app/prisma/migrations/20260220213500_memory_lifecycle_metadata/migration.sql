-- Add lifecycle metadata to memory tables (P2 baseline)

ALTER TABLE "UserMemory"
    ADD COLUMN "source" TEXT NOT NULL DEFAULT 'explicit',
    ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN "retrievalCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "usedInAnswerCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProjectMemory"
    ADD COLUMN "source" TEXT NOT NULL DEFAULT 'decision',
    ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN "retrievalCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "usedInAnswerCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "StudyMemory"
    ADD COLUMN "retrievalCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "usedInAnswerCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "UserMemory_userId_pinned_idx" ON "UserMemory"("userId", "pinned");
CREATE INDEX "ProjectMemory_projectId_pinned_idx" ON "ProjectMemory"("projectId", "pinned");
CREATE INDEX "StudyMemory_projectId_pinned_idx" ON "StudyMemory"("projectId", "pinned");
