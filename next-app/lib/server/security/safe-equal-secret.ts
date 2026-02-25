import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Constant-time secret comparison for auth/webhook token checks.
 */
export function safeEqualSecret(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
}
