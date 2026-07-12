-- AlterTable
ALTER TABLE "AIUsageReservation" ADD COLUMN "attemptKey" TEXT;

-- Backfill the only safe stable identity for any pre-existing local rows.
UPDATE "AIUsageReservation" SET "attemptKey" = "id" WHERE "attemptKey" IS NULL;

ALTER TABLE "AIUsageReservation" ALTER COLUMN "attemptKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AIUsageReservation_attemptKey_key"
ON "AIUsageReservation"("attemptKey");
