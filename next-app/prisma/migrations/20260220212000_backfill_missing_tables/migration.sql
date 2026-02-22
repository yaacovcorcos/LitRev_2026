-- Backfill: create 13 tables + 2 columns that were applied via `db push`
-- but never had a migration file. All statements are idempotent.

-- ============================================================================
-- 1. Missing columns on existing tables
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Study' AND column_name = 'workspaceId'
  ) THEN
    ALTER TABLE "Study" ADD COLUMN "workspaceId" TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Study_workspaceId_idx" ON "Study"("workspaceId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'FileAsset' AND column_name = 'workspaceId'
  ) THEN
    ALTER TABLE "FileAsset" ADD COLUMN "workspaceId" TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "FileAsset_workspaceId_idx" ON "FileAsset"("workspaceId");

-- ============================================================================
-- 2. AIConversation
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AIConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "title" TEXT,
    "context" TEXT NOT NULL,
    "page" TEXT,
    "projectId" TEXT,
    "studyId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AIConversation_userId_context_idx" ON "AIConversation"("userId", "context");
CREATE INDEX IF NOT EXISTS "AIConversation_userId_projectId_idx" ON "AIConversation"("userId", "projectId");
CREATE INDEX IF NOT EXISTS "AIConversation_workspaceId_idx" ON "AIConversation"("workspaceId");
CREATE INDEX IF NOT EXISTS "AIConversation_workspaceId_context_idx" ON "AIConversation"("workspaceId", "context");
CREATE INDEX IF NOT EXISTS "AIConversation_projectId_idx" ON "AIConversation"("projectId");
CREATE INDEX IF NOT EXISTS "AIConversation_studyId_idx" ON "AIConversation"("studyId");
CREATE INDEX IF NOT EXISTS "AIConversation_context_idx" ON "AIConversation"("context");

-- ============================================================================
-- 3. AIMessage
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AIMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "toolResultId" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AIMessage_conversationId_idx" ON "AIMessage"("conversationId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AIMessage_conversationId_fkey'
  ) THEN
    ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 4. AIUsage
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AIUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "projectId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AIUsage_userId_createdAt_idx" ON "AIUsage"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIUsage_workspaceId_createdAt_idx" ON "AIUsage"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIUsage_projectId_createdAt_idx" ON "AIUsage"("projectId", "createdAt");

-- ============================================================================
-- 5. UserMemory (base columns only — lifecycle columns added by 213500)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "rationale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'UserMemory_userId_key_key'
  ) THEN
    CREATE UNIQUE INDEX "UserMemory_userId_key_key" ON "UserMemory"("userId", "key");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "UserMemory_userId_status_idx" ON "UserMemory"("userId", "status");
CREATE INDEX IF NOT EXISTS "UserMemory_userId_type_idx" ON "UserMemory"("userId", "type");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'UserMemory_userId_fkey'
  ) THEN
    ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 6. ProjectMemory (base columns only — lifecycle columns added by 213500)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ProjectMemory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "statement" TEXT NOT NULL,
    "rationale" TEXT,
    "context" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersededBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "importance" TEXT NOT NULL DEFAULT 'normal',

    CONSTRAINT "ProjectMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectMemory_projectId_status_idx" ON "ProjectMemory"("projectId", "status");
CREATE INDEX IF NOT EXISTS "ProjectMemory_projectId_type_idx" ON "ProjectMemory"("projectId", "type");
CREATE INDEX IF NOT EXISTS "ProjectMemory_projectId_importance_idx" ON "ProjectMemory"("projectId", "importance");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ProjectMemory_projectId_fkey'
  ) THEN
    ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 7. StudyMemory (base columns only — lifecycle columns added by 213500)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "StudyMemory" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "confidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "StudyMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudyMemory_studyId_type_idx" ON "StudyMemory"("studyId", "type");
CREATE INDEX IF NOT EXISTS "StudyMemory_projectId_type_idx" ON "StudyMemory"("projectId", "type");
CREATE INDEX IF NOT EXISTS "StudyMemory_studyId_status_idx" ON "StudyMemory"("studyId", "status");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StudyMemory_studyId_fkey'
  ) THEN
    ALTER TABLE "StudyMemory" ADD CONSTRAINT "StudyMemory_studyId_fkey"
      FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StudyMemory_projectId_fkey'
  ) THEN
    ALTER TABLE "StudyMemory" ADD CONSTRAINT "StudyMemory_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 8. ConversationSummary
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ConversationSummary" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decisions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "followUpNeeded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "messageCount" INTEGER NOT NULL,
    "lastSummarizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'ConversationSummary_conversationId_key'
  ) THEN
    CREATE UNIQUE INDEX "ConversationSummary_conversationId_key" ON "ConversationSummary"("conversationId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ConversationSummary_conversationId_idx" ON "ConversationSummary"("conversationId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ConversationSummary_conversationId_fkey'
  ) THEN
    ALTER TABLE "ConversationSummary" ADD CONSTRAINT "ConversationSummary_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 9. MemoryRetrieval
-- ============================================================================

CREATE TABLE IF NOT EXISTS "MemoryRetrieval" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "query" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL,
    "memoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resultCount" INTEGER NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryRetrieval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MemoryRetrieval_conversationId_idx" ON "MemoryRetrieval"("conversationId");
CREATE INDEX IF NOT EXISTS "MemoryRetrieval_projectId_idx" ON "MemoryRetrieval"("projectId");
CREATE INDEX IF NOT EXISTS "MemoryRetrieval_createdAt_idx" ON "MemoryRetrieval"("createdAt");

-- ============================================================================
-- 10. AgentRun
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AgentRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "conversationId" TEXT,
    "userId" TEXT,
    "trigger" TEXT NOT NULL,
    "agentMode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "model" TEXT,
    "costTokensIn" INTEGER NOT NULL DEFAULT 0,
    "costTokensOut" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentRun_projectId_startedAt_idx" ON "AgentRun"("projectId", "startedAt");
CREATE INDEX IF NOT EXISTS "AgentRun_conversationId_idx" ON "AgentRun"("conversationId");
CREATE INDEX IF NOT EXISTS "AgentRun_userId_idx" ON "AgentRun"("userId");

-- ============================================================================
-- 11. RunEvent
-- ============================================================================

CREATE TABLE IF NOT EXISTS "RunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "toolName" TEXT,
    "artifactId" TEXT,
    "messageRole" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "errorCode" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RunEvent_runId_sequence_idx" ON "RunEvent"("runId", "sequence");
CREATE INDEX IF NOT EXISTS "RunEvent_runId_type_idx" ON "RunEvent"("runId", "type");
CREATE INDEX IF NOT EXISTS "RunEvent_artifactId_idx" ON "RunEvent"("artifactId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'RunEvent_runId_fkey'
  ) THEN
    ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 12. Artifact
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Artifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "conversationId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "snapshot" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceEventId" TEXT,
    "applyId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "appliedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'Artifact_applyId_key'
  ) THEN
    CREATE UNIQUE INDEX "Artifact_applyId_key" ON "Artifact"("applyId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Artifact_runId_idx" ON "Artifact"("runId");
CREATE INDEX IF NOT EXISTS "Artifact_projectId_status_idx" ON "Artifact"("projectId", "status");
CREATE INDEX IF NOT EXISTS "Artifact_conversationId_idx" ON "Artifact"("conversationId");
CREATE INDEX IF NOT EXISTS "Artifact_type_status_idx" ON "Artifact"("type", "status");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Artifact_runId_fkey'
  ) THEN
    ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Artifact_projectId_fkey'
  ) THEN
    ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 13. AutonomyConfig
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AutonomyConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "preset" TEXT NOT NULL,
    "toolOverrides" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutonomyConfig_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'AutonomyConfig_userId_projectId_key'
  ) THEN
    CREATE UNIQUE INDEX "AutonomyConfig_userId_projectId_key" ON "AutonomyConfig"("userId", "projectId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AutonomyConfig_userId_idx" ON "AutonomyConfig"("userId");
CREATE INDEX IF NOT EXISTS "AutonomyConfig_projectId_idx" ON "AutonomyConfig"("projectId");

-- ============================================================================
-- 14. Note
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT,
    "content" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "linkedStudyId" TEXT,
    "linkedSection" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceConversationId" TEXT,
    "sourceMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Note_projectId_idx" ON "Note"("projectId");
CREATE INDEX IF NOT EXISTS "Note_projectId_source_idx" ON "Note"("projectId", "source");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Note_projectId_fkey'
  ) THEN
    ALTER TABLE "Note" ADD CONSTRAINT "Note_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
