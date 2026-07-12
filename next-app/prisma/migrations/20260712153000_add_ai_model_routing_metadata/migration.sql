-- Persist requested and provider-observed model routing truth for agent runs.
ALTER TABLE "AgentRun"
    ADD COLUMN "provider" TEXT,
    ADD COLUMN "reasoningEffort" TEXT,
    ADD COLUMN "deliveryMode" TEXT,
    ADD COLUMN "actualModel" TEXT,
    ADD COLUMN "actualProvider" TEXT,
    ADD COLUMN "actualReasoningEffort" TEXT,
    ADD COLUMN "actualDeliveryMode" TEXT;

-- Persist enough usage detail for provider attribution, cache accounting, and
-- cost estimates without changing the existing rate-limit token contract.
ALTER TABLE "AIUsage"
    ADD COLUMN "provider" TEXT,
    ADD COLUMN "requestedModel" TEXT,
    ADD COLUMN "requestedProvider" TEXT,
    ADD COLUMN "requestedReasoningEffort" TEXT,
    ADD COLUMN "requestedDeliveryMode" TEXT,
    ADD COLUMN "actualReasoningEffort" TEXT,
    ADD COLUMN "actualDeliveryMode" TEXT,
    ADD COLUMN "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "estimatedCostUsd" DOUBLE PRECISION;
