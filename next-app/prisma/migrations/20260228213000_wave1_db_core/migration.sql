ALTER TABLE "Study"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Study_projectId_deletedAt_idx"
  ON "Study"("projectId", "deletedAt");

ALTER TABLE "Note"
  ADD COLUMN IF NOT EXISTS "contentText" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Note_projectId_deletedAt_idx"
  ON "Note"("projectId", "deletedAt");

-- GIN index for full-text search on contentText (ILIKE fallback still works without it)
CREATE INDEX IF NOT EXISTS "Note_contentText_fts_idx"
  ON "Note" USING GIN (to_tsvector('english', COALESCE("contentText", '')));
