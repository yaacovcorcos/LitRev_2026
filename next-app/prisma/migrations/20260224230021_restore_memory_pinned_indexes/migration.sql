-- CreateIndex
CREATE INDEX "ProjectMemory_projectId_pinned_idx" ON "ProjectMemory"("projectId", "pinned");

-- CreateIndex
CREATE INDEX "StudyMemory_projectId_pinned_idx" ON "StudyMemory"("projectId", "pinned");

-- CreateIndex
CREATE INDEX "UserMemory_userId_pinned_idx" ON "UserMemory"("userId", "pinned");
