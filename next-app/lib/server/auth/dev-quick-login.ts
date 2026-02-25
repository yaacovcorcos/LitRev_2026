import "server-only";

type EnvLike = {
  NODE_ENV?: string;
  ENABLE_DEV_QUICK_LOGIN?: string;
  VERCEL_ENV?: string;
};

export const DEV_QUICK_LOGIN_USER_ID = "preview-dev-user";
export const DEV_QUICK_LOGIN_EMAIL = "preview-dev-user@local.invalid";
export const DEV_QUICK_LOGIN_NAME = "Preview Dev User";

export function isDevQuickLoginAllowed(env: EnvLike = process.env): boolean {
  // Always allow in local/dev runtime for fast iteration.
  if (env.NODE_ENV !== "production") return true;
  // In production runtime, allow only on preview deployments with explicit flag.
  return env.VERCEL_ENV === "preview" && env.ENABLE_DEV_QUICK_LOGIN === "1";
}

export function normalizeCallbackUrl(input: string | null | undefined): string {
  if (!input) return "/";
  if (!input.startsWith("/") || input.startsWith("//")) return "/";
  return input;
}
