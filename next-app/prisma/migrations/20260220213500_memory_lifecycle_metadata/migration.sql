-- Add lifecycle metadata to memory tables (P2 baseline)
-- Idempotent: each column guarded so re-running is safe.

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserMemory' AND column_name = 'source') THEN
        ALTER TABLE "UserMemory" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'explicit';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserMemory' AND column_name = 'confidence') THEN
        ALTER TABLE "UserMemory" ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserMemory' AND column_name = 'retrievalCount') THEN
        ALTER TABLE "UserMemory" ADD COLUMN "retrievalCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserMemory' AND column_name = 'usedInAnswerCount') THEN
        ALTER TABLE "UserMemory" ADD COLUMN "usedInAnswerCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserMemory' AND column_name = 'acceptedCount') THEN
        ALTER TABLE "UserMemory" ADD COLUMN "acceptedCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserMemory' AND column_name = 'rejectedCount') THEN
        ALTER TABLE "UserMemory" ADD COLUMN "rejectedCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserMemory' AND column_name = 'contradictionCount') THEN
        ALTER TABLE "UserMemory" ADD COLUMN "contradictionCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserMemory' AND column_name = 'pinned') THEN
        ALTER TABLE "UserMemory" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProjectMemory' AND column_name = 'source') THEN
        ALTER TABLE "ProjectMemory" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'decision';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProjectMemory' AND column_name = 'confidence') THEN
        ALTER TABLE "ProjectMemory" ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProjectMemory' AND column_name = 'retrievalCount') THEN
        ALTER TABLE "ProjectMemory" ADD COLUMN "retrievalCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProjectMemory' AND column_name = 'usedInAnswerCount') THEN
        ALTER TABLE "ProjectMemory" ADD COLUMN "usedInAnswerCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProjectMemory' AND column_name = 'acceptedCount') THEN
        ALTER TABLE "ProjectMemory" ADD COLUMN "acceptedCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProjectMemory' AND column_name = 'rejectedCount') THEN
        ALTER TABLE "ProjectMemory" ADD COLUMN "rejectedCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProjectMemory' AND column_name = 'contradictionCount') THEN
        ALTER TABLE "ProjectMemory" ADD COLUMN "contradictionCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProjectMemory' AND column_name = 'pinned') THEN
        ALTER TABLE "ProjectMemory" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StudyMemory' AND column_name = 'retrievalCount') THEN
        ALTER TABLE "StudyMemory" ADD COLUMN "retrievalCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StudyMemory' AND column_name = 'usedInAnswerCount') THEN
        ALTER TABLE "StudyMemory" ADD COLUMN "usedInAnswerCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StudyMemory' AND column_name = 'acceptedCount') THEN
        ALTER TABLE "StudyMemory" ADD COLUMN "acceptedCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StudyMemory' AND column_name = 'rejectedCount') THEN
        ALTER TABLE "StudyMemory" ADD COLUMN "rejectedCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StudyMemory' AND column_name = 'contradictionCount') THEN
        ALTER TABLE "StudyMemory" ADD COLUMN "contradictionCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StudyMemory' AND column_name = 'pinned') THEN
        ALTER TABLE "StudyMemory" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "UserMemory_userId_pinned_idx" ON "UserMemory"("userId", "pinned");
CREATE INDEX IF NOT EXISTS "ProjectMemory_projectId_pinned_idx" ON "ProjectMemory"("projectId", "pinned");
CREATE INDEX IF NOT EXISTS "StudyMemory_projectId_pinned_idx" ON "StudyMemory"("projectId", "pinned");
