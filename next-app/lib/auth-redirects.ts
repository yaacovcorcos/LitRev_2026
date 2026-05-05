export const DEFAULT_POST_LOGIN_PATH = "/ai";

export function normalizePostLoginCallbackUrl(input: string | null | undefined): string {
  if (!input) return DEFAULT_POST_LOGIN_PATH;
  if (!input.startsWith("/") || input.startsWith("//")) return DEFAULT_POST_LOGIN_PATH;
  return input;
}

export function buildLoginUrl(callbackUrl: string | null | undefined): string {
  const normalizedCallbackUrl = normalizePostLoginCallbackUrl(callbackUrl);
  return `/login?callbackUrl=${encodeURIComponent(normalizedCallbackUrl)}`;
}

export function getCurrentLocationCallbackUrl(
  locationLike: Pick<Location, "pathname" | "search" | "hash">,
): string {
  const { pathname, search, hash } = locationLike;
  return `${pathname}${search}${hash}`;
}
