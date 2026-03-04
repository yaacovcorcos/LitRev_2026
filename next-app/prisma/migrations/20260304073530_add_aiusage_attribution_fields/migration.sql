-- AlterTable
ALTER TABLE "AIUsage" ADD COLUMN     "contextPage" TEXT NOT NULL DEFAULT 'legacy_unknown',
ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'legacy_unknown';

-- CreateIndex
CREATE INDEX "AIUsage_conversationId_createdAt_idx" ON "AIUsage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsage_source_createdAt_idx" ON "AIUsage"("source", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsage_contextPage_createdAt_idx" ON "AIUsage"("contextPage", "createdAt");

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
