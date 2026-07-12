import "server-only";

import type {
  ReliabilityFlowName,
  ReliabilityMetricInput,
  ReliabilityRouteTemplate,
  ReliabilitySurface,
} from "@/types/reliability-telemetry";
import type {
  PerformanceMetricInput,
  PerformanceRouteTemplate,
  PerformanceSurface,
} from "@/types/performance-telemetry";
import type { AuthContext } from "@/lib/server/auth/session";
import { assertProjectAccess } from "@/lib/server/access";

const ANONYMOUS_TELEMETRY_WINDOW_MS = 60_000;
const ANONYMOUS_TELEMETRY_LIMIT = 120;

type AnonymousTelemetryBucket = {
  count: number;
  resetAt: number;
};

const anonymousTelemetryBuckets = new Map<string, AnonymousTelemetryBucket>();

const AUTH_ROUTE_TEMPLATES = new Set<ReliabilityRouteTemplate>(["/login", "/signup"]);
const HOME_ROUTE_TEMPLATES = new Set<ReliabilityRouteTemplate>(["/"]);
const AUTH_ROUTE_READY_SURFACES = new Set<ReliabilitySurface>(["auth"]);
const HOME_ROUTE_READY_SURFACES = new Set<ReliabilitySurface>(["home"]);
const HOME_ALLOWED_FLOWS = new Set<ReliabilityFlowName>([
  "enter_workspace",
  "create_project",
  "open_sample_review",
]);
const AUTH_ALLOWED_FLOWS = new Set<ReliabilityFlowName>(["magic_link_requested"]);
const ANONYMOUS_HOME_PERFORMANCE = new Set<PerformanceSurface>(["home"]);
const ANONYMOUS_OTHER_PERFORMANCE = new Set<PerformanceSurface>(["other"]);
const ANONYMOUS_HOME_ROUTES = new Set<PerformanceRouteTemplate>(["/"]);
const ANONYMOUS_OTHER_ROUTES = new Set<PerformanceRouteTemplate>(["/other"]);

export class TelemetryPolicyError extends Error {}

export class TelemetryProjectAccessDeniedError extends TelemetryPolicyError {
  constructor() {
    super("Project not found or access denied");
  }
}

export class TelemetryAnonymousNotAllowedError extends TelemetryPolicyError {
  constructor() {
    super("Anonymous telemetry is not allowed for this payload");
  }
}

export class TelemetryAnonymousRateLimitedError extends TelemetryPolicyError {
  readonly retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null) {
    super("Anonymous telemetry rate limit exceeded");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function assertTelemetryProjectAccess(
  auth: AuthContext,
  projectId: string,
): Promise<void> {
  try {
    await assertProjectAccess(
      { ownerId: auth.userId, workspaceId: auth.workspaceId },
      projectId,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Project not found or access denied."
    ) {
      throw new TelemetryProjectAccessDeniedError();
    }
    throw error;
  }
}

export function assertAnonymousTelemetryRateLimit(
  clientIp: string | null,
): void {
  const key = clientIp ?? "anonymous";
  const now = Date.now();
  const existing = anonymousTelemetryBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    anonymousTelemetryBuckets.set(key, {
      count: 1,
      resetAt: now + ANONYMOUS_TELEMETRY_WINDOW_MS,
    });
    return;
  }

  if (existing.count >= ANONYMOUS_TELEMETRY_LIMIT) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000),
    );
    throw new TelemetryAnonymousRateLimitedError(retryAfterSeconds);
  }

  existing.count += 1;
}

export function assertAnonymousReliabilityMetricAllowed(
  input: ReliabilityMetricInput,
): void {
  if (input.projectId || input.conversationId || input.runId) {
    throw new TelemetryAnonymousNotAllowedError();
  }

  if (input.type === "reliability.v1.route.ready") {
    const { routeTemplate } = input.payload;
    if (
      AUTH_ROUTE_READY_SURFACES.has(input.surface) &&
      AUTH_ROUTE_TEMPLATES.has(routeTemplate)
    ) {
      return;
    }
    if (
      HOME_ROUTE_READY_SURFACES.has(input.surface) &&
      HOME_ROUTE_TEMPLATES.has(routeTemplate)
    ) {
      return;
    }
    throw new TelemetryAnonymousNotAllowedError();
  }

  if (input.type === "reliability.v1.route.flow_completed") {
    const { flow, routeTemplate } = input.payload;
    if (
      input.surface === "auth" &&
      AUTH_ROUTE_TEMPLATES.has(routeTemplate) &&
      AUTH_ALLOWED_FLOWS.has(flow)
    ) {
      return;
    }
    if (
      input.surface === "home" &&
      HOME_ROUTE_TEMPLATES.has(routeTemplate) &&
      HOME_ALLOWED_FLOWS.has(flow)
    ) {
      return;
    }
    throw new TelemetryAnonymousNotAllowedError();
  }

  throw new TelemetryAnonymousNotAllowedError();
}

export function assertAnonymousPerformanceMetricAllowed(
  input: PerformanceMetricInput,
): void {
  if (input.projectId) {
    throw new TelemetryAnonymousNotAllowedError();
  }

  if (
    ANONYMOUS_HOME_PERFORMANCE.has(input.surface) &&
    ANONYMOUS_HOME_ROUTES.has(input.routeTemplate)
  ) {
    return;
  }

  if (
    ANONYMOUS_OTHER_PERFORMANCE.has(input.surface) &&
    ANONYMOUS_OTHER_ROUTES.has(input.routeTemplate)
  ) {
    return;
  }

  throw new TelemetryAnonymousNotAllowedError();
}

export const __private__ = {
  anonymousTelemetryBuckets,
};
