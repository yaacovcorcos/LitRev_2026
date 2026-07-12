-- AlterTable
ALTER TABLE "AgentRun"
ADD COLUMN "memoryExtractionStatus" TEXT NOT NULL DEFAULT 'skipped',
ADD COLUMN "memoryExtractionAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "memoryExtractionLeaseToken" TEXT,
ADD COLUMN "memoryExtractionLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "memoryExtractionCompletedAt" TIMESTAMP(3),
ADD COLUMN "memoryExtractionLastError" TEXT;

-- CreateIndex
CREATE INDEX "AgentRun_memoryExtractionStatus_memoryExtractionLeaseExpiresAt_idx"
ON "AgentRun"("memoryExtractionStatus", "memoryExtractionLeaseExpiresAt");
