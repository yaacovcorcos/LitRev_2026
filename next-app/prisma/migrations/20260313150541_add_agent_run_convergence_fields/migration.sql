-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "abnormalEndClassification" TEXT,
ADD COLUMN     "finalizationState" TEXT NOT NULL DEFAULT 'not_started',
ADD COLUMN     "lastDurableProgressAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "AgentRun_conversationId_lastDurableProgressAt_idx" ON "AgentRun"("conversationId", "lastDurableProgressAt");
