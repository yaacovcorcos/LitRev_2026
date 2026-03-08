ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "demoKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Project_ownerId_workspaceId_demoKey_key"
ON "Project"("ownerId", "workspaceId", "demoKey");
