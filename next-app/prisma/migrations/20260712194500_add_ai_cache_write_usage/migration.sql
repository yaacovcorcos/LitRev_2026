-- Preserve provider-reported prompt-cache write tokens so OpenAI GPT-5.6
-- estimates can apply the documented 1.25x cache-write input rate.
ALTER TABLE "AIUsage"
    ADD COLUMN "cacheWriteInputTokens" INTEGER NOT NULL DEFAULT 0;
