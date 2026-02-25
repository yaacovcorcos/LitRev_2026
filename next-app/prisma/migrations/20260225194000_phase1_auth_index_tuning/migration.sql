-- -----------------------------------------------------------------------------
-- Phase 1 auth index tuning
-- - Remove redundant Session token index (token is already unique)
-- - Add Verification indexes used by Better Auth lookup/cleanup paths
-- -----------------------------------------------------------------------------

DROP INDEX IF EXISTS "Session_token_idx";
DROP INDEX IF EXISTS "Verification_identifier_idx";

CREATE INDEX IF NOT EXISTS "Verification_identifier_createdAt_idx"
  ON "Verification" ("identifier", "createdAt");

CREATE INDEX IF NOT EXISTS "Verification_expiresAt_idx"
  ON "Verification" ("expiresAt");
