-- Normalize legacy global sentinel IDs to NULL for optional project scopes
UPDATE "AIUsage" SET "projectId" = NULL WHERE "projectId" = 'global';
UPDATE "AIConversation" SET "projectId" = NULL WHERE "projectId" = 'global';
UPDATE "AgentRun" SET "projectId" = NULL WHERE "projectId" = 'global';
UPDATE "Artifact" SET "projectId" = NULL WHERE "projectId" = 'global';
UPDATE "AutonomyConfig" SET "projectId" = NULL WHERE "projectId" = 'global';

-- Global / cross-project runs and artifacts must be allowed without a project FK
ALTER TABLE "AgentRun" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Artifact" ALTER COLUMN "projectId" DROP NOT NULL;
