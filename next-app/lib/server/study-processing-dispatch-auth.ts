import "server-only";

import { safeEqualSecret } from "@/lib/server/security/safe-equal-secret";

export const STUDY_PROCESSING_INTERNAL_PATH = "/api/internal/study-processing";
export const STUDY_PROCESSING_CRON_PATH = "/api/cron/study-processing";

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function hasMatchingBearerSecret(request: Request, expectedSecret: string | undefined): boolean {
  const token = getBearerToken(request);
  if (!token || !expectedSecret) return false;
  return safeEqualSecret(token, expectedSecret);
}

export function isAuthorizedStudyProcessingInternalRequest(request: Request): boolean {
  return hasMatchingBearerSecret(request, process.env.STUDY_PROCESSING_INTERNAL_TOKEN);
}

export function isAuthorizedStudyProcessingCronRequest(request: Request): boolean {
  return hasMatchingBearerSecret(request, process.env.CRON_SECRET);
}
