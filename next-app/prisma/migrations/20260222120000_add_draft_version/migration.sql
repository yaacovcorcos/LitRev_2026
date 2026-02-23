-- Add DraftVersion table for immutable draft section version history
-- Replaces Note-based draft backup storage (Phase 12)

CREATE TABLE IF NOT EXISTS "DraftVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "contentText" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "artifactId" TEXT,
    "conversationId" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DraftVersion_projectId_section_version_key"
    ON "DraftVersion"("projectId", "section", "version");

CREATE INDEX IF NOT EXISTS "DraftVersion_projectId_section_idx"
    ON "DraftVersion"("projectId", "section");

CREATE INDEX IF NOT EXISTS "DraftVersion_projectId_createdAt_idx"
    ON "DraftVersion"("projectId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'DraftVersion_projectId_fkey'
  ) THEN
    ALTER TABLE "DraftVersion" ADD CONSTRAINT "DraftVersion_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Migrate existing draft backup Notes into DraftVersion rows
INSERT INTO "DraftVersion" ("id", "projectId", "section", "content", "wordCount", "version", "createdAt")
SELECT
    gen_random_uuid()::text,
    n."projectId",
    LOWER(n."linkedSection"),
    n."content",
    0,
    1,
    n."createdAt"
FROM "Note" n
WHERE n."source" = 'conversation'
  AND n."linkedSection" IS NOT NULL
  AND n."tags" @> ARRAY['draft']
ON CONFLICT ("projectId", "section", "version") DO NOTHING;

-- Remove the now-migrated draft backup Notes
DELETE FROM "Note"
WHERE "source" = 'conversation'
  AND "linkedSection" IS NOT NULL
  AND "tags" @> ARRAY['draft'];
