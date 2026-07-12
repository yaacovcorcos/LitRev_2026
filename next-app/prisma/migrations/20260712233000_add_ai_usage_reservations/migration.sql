-- CreateTable
CREATE TABLE "AIUsageReservation" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "projectId" TEXT,
    "conversationId" TEXT,
    "source" TEXT NOT NULL,
    "contextPage" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requestedModel" TEXT NOT NULL,
    "reservedTokens" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "actualModel" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "AIUsageReservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AIUsageReservation_reservedTokens_check" CHECK ("reservedTokens" > 0),
    CONSTRAINT "AIUsageReservation_status_check" CHECK ("status" IN ('active', 'failed', 'unknown', 'settled')),
    CONSTRAINT "AIUsageReservation_inputTokens_check" CHECK ("inputTokens" IS NULL OR "inputTokens" >= 0),
    CONSTRAINT "AIUsageReservation_outputTokens_check" CHECK ("outputTokens" IS NULL OR "outputTokens" >= 0)
);

-- AlterTable
ALTER TABLE "AIUsage" ADD COLUMN "reservationId" TEXT;

-- CreateIndex
CREATE INDEX "AIUsageReservation_scopeKey_createdAt_idx"
ON "AIUsageReservation"("scopeKey", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageReservation_scopeKey_status_createdAt_idx"
ON "AIUsageReservation"("scopeKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageReservation_status_updatedAt_idx"
ON "AIUsageReservation"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AIUsageReservation_conversationId_createdAt_idx"
ON "AIUsageReservation"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsage_reservationId_key" ON "AIUsage"("reservationId");

-- AddForeignKey
ALTER TABLE "AIUsage"
ADD CONSTRAINT "AIUsage_reservationId_fkey"
FOREIGN KEY ("reservationId") REFERENCES "AIUsageReservation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
