ALTER TABLE "AgentRun"
ADD COLUMN "durabilityState" TEXT NOT NULL DEFAULT 'durable',
ADD COLUMN "durabilityDegradedReason" TEXT;
