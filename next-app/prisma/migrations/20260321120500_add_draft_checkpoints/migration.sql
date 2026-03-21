-- CreateTable
CREATE TABLE "DraftCheckpoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "label" TEXT,
    "kind" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "fileAssetId" TEXT,
    "artifactId" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftCheckpoint_projectId_createdAt_idx" ON "DraftCheckpoint"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "DraftCheckpoint_projectId_kind_createdAt_idx" ON "DraftCheckpoint"("projectId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "DraftCheckpoint_workspaceId_idx" ON "DraftCheckpoint"("workspaceId");

-- CreateIndex
CREATE INDEX "DraftCheckpoint_fileAssetId_idx" ON "DraftCheckpoint"("fileAssetId");

-- CreateIndex
CREATE INDEX "DraftCheckpoint_artifactId_idx" ON "DraftCheckpoint"("artifactId");

-- CreateIndex
CREATE INDEX "DraftCheckpoint_conversationId_idx" ON "DraftCheckpoint"("conversationId");

-- AddForeignKey
ALTER TABLE "DraftCheckpoint"
ADD CONSTRAINT "DraftCheckpoint_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftCheckpoint"
ADD CONSTRAINT "DraftCheckpoint_fileAssetId_fkey"
FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftCheckpoint"
ADD CONSTRAINT "DraftCheckpoint_artifactId_fkey"
FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftCheckpoint"
ADD CONSTRAINT "DraftCheckpoint_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
