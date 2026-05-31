import "server-only";

const DEFAULT_LOCAL_AUTH_ORIGIN = "http://localhost:3000";
const LOCAL_AUTH_ORIGIN_PATTERNS = [
  "http://localhost",
  "http://localhost:*",
  "http://127.0.0.1",
  "http://127.0.0.1:*",
  "http://[::1]",
  "http://[::1]:*",
] as const;

type AuthOriginEnv = {
  BETTER_AUTH_URL?: string | undefined;
  NEXT_PUBLIC_BETTER_AUTH_URL?: string | undefined;
  BETTER_AUTH_TRUSTED_ORIGINS?: string | undefined;
  ENABLE_DEV_QUICK_LOGIN?: string | undefined;
  PERF_PROBE_BASE_URL?: string | undefined;
  PERF_PROBE_INSECURE_AUTH_COOKIES?: string | undefined;
  VERCEL_URL?: string | undefined;
  VERCEL_ENV?: string | undefined;
  NODE_ENV?: string | undefined;
} & Record<string, string | undefined>;

function normalizeOrigin(input: string | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function splitTrustedOrigins(input: string | undefined): string[] {
  return input
    ?.split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin)) ?? [];
}

function isLocalAuthOrigin(origin: string | null): boolean {
  if (!origin) return false;

  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "http:" && (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

export function getAuthCookieSecurityOverride(env: AuthOriginEnv = process.env): boolean | undefined {
  if (env.PERF_PROBE_INSECURE_AUTH_COOKIES !== "1") return undefined;
  if (env.NODE_ENV !== "production") return undefined;
  if (env.VERCEL_ENV !== "preview") return undefined;
  if (env.ENABLE_DEV_QUICK_LOGIN !== "1") return undefined;

  const probeOrigin = normalizeOrigin(env.PERF_PROBE_BASE_URL);
  if (!isLocalAuthOrigin(probeOrigin)) return undefined;

  return false;
}

export function getAuthBaseURL(env: AuthOriginEnv = process.env): string {
  const configuredBaseURL =
    normalizeOrigin(env.BETTER_AUTH_URL) ||
    normalizeOrigin(env.NEXT_PUBLIC_BETTER_AUTH_URL) ||
    (env.VERCEL_URL ? `https://${env.VERCEL_URL.trim()}` : null);

  if (isLocalAuthOrigin(configuredBaseURL)) {
    return "";
  }

  return configuredBaseURL || "";
}

export function getAuthTrustedOrigins(env: AuthOriginEnv = process.env): string[] {
  const baseURL = getAuthBaseURL(env);
  const explicitOrigins = [
    baseURL,
    normalizeOrigin(env.BETTER_AUTH_URL),
    normalizeOrigin(env.NEXT_PUBLIC_BETTER_AUTH_URL),
    env.VERCEL_URL ? normalizeOrigin(`https://${env.VERCEL_URL}`) : null,
    ...splitTrustedOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS),
  ].filter((origin): origin is string => Boolean(origin));

  const shouldTrustLocalPorts = explicitOrigins.some(isLocalAuthOrigin) ||
    (explicitOrigins.length === 0 && env.NODE_ENV !== "production");
  return Array.from(
    new Set([
      ...(explicitOrigins.length === 0 && env.NODE_ENV !== "production"
        ? [DEFAULT_LOCAL_AUTH_ORIGIN]
        : []),
      ...explicitOrigins,
      ...(shouldTrustLocalPorts ? LOCAL_AUTH_ORIGIN_PATTERNS : []),
    ]),
  );
}
