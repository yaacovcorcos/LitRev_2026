-- -----------------------------------------------------------------------------
-- Phase 1 auth foundation
-- - Add Better Auth tables (Session, Account, Verification)
-- - Upgrade User fields required by Better Auth
-- - Normalize legacy placeholder identity split (single-* -> local-*)
-- -----------------------------------------------------------------------------

-- Ensure canonical local placeholders exist before data rewrites.
INSERT INTO "User" ("id", "email", "name", "createdAt", "updatedAt")
VALUES ('local-user', 'local-user@local.invalid', 'Local User', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE
SET "email" = EXCLUDED."email",
    "name" = EXCLUDED."name",
    "updatedAt" = NOW();

INSERT INTO "Workspace" ("id", "name", "createdAt", "updatedAt")
VALUES ('local-workspace', 'Local Workspace', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- Avoid unique collision when both single-* and local-* membership rows exist.
DELETE FROM "WorkspaceMember"
WHERE "workspaceId" = 'single-workspace'
  AND "userId" = 'single-user'
  AND EXISTS (
    SELECT 1
    FROM "WorkspaceMember" existing
    WHERE existing."workspaceId" = 'local-workspace'
      AND existing."userId" = 'local-user'
  );

-- Normalize split placeholders across FK and nullable ownership columns.
UPDATE "WorkspaceMember" SET "userId" = 'local-user' WHERE "userId" = 'single-user';
UPDATE "WorkspaceMember" SET "workspaceId" = 'local-workspace' WHERE "workspaceId" = 'single-workspace';
UPDATE "Project" SET "ownerId" = 'local-user' WHERE "ownerId" = 'single-user';
UPDATE "Project" SET "workspaceId" = 'local-workspace' WHERE "workspaceId" = 'single-workspace';
UPDATE "Study" SET "workspaceId" = 'local-workspace' WHERE "workspaceId" = 'single-workspace';
UPDATE "FileAsset" SET "workspaceId" = 'local-workspace' WHERE "workspaceId" = 'single-workspace';
UPDATE "AIConversation" SET "userId" = 'local-user' WHERE "userId" = 'single-user';
UPDATE "AIConversation" SET "workspaceId" = 'local-workspace' WHERE "workspaceId" = 'single-workspace';
UPDATE "AIUsage" SET "userId" = 'local-user' WHERE "userId" = 'single-user';
UPDATE "AIUsage" SET "workspaceId" = 'local-workspace' WHERE "workspaceId" = 'single-workspace';
UPDATE "UserMemory" SET "userId" = 'local-user' WHERE "userId" = 'single-user';
UPDATE "MemoryRetrieval" SET "userId" = 'local-user' WHERE "userId" = 'single-user';
UPDATE "MemoryEmbedding" SET "userId" = 'local-user' WHERE "userId" = 'single-user';
UPDATE "AgentRun" SET "userId" = 'local-user' WHERE "userId" = 'single-user';
UPDATE "Artifact" SET "userId" = 'local-user' WHERE "userId" = 'single-user';
UPDATE "AutonomyConfig" SET "userId" = 'local-user' WHERE "userId" = 'single-user';
UPDATE "Note" SET "userId" = 'local-user' WHERE "userId" = 'single-user';

INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
VALUES (substr(md5(random()::text), 1, 24), 'local-workspace', 'local-user', 'owner', NOW())
ON CONFLICT ("workspaceId", "userId") DO NOTHING;

-- Better Auth-required user fields.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "image" TEXT;

-- Backfill before NOT NULL constraints.
UPDATE "User"
SET "email" = CONCAT("id", '@local.invalid')
WHERE "email" IS NULL;

UPDATE "User"
SET "name" = 'Local User'
WHERE "name" IS NULL OR btrim("name") = '';

ALTER TABLE "User"
  ALTER COLUMN "email" SET NOT NULL,
  ALTER COLUMN "name" SET NOT NULL;

-- Better Auth core tables.
CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Verification" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_token_idx" ON "Session"("token");
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Account"
  ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
