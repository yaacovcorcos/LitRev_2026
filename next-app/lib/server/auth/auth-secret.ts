import "server-only";

const DEV_FALLBACK_AUTH_SECRET = "litrev-dev-only-better-auth-secret";

export function getBetterAuthSecret(): string {
  const configuredSecret = process.env.BETTER_AUTH_SECRET?.trim();
  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  }

  return DEV_FALLBACK_AUTH_SECRET;
}
