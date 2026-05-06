export const DEFAULT_POST_LOGIN_PATH = "/ai";

function hasUnsafePathCharacters(value: string): boolean {
  return /[\\\u0000-\u001F\u007F]/.test(value);
}

function isSafeLocalCallbackPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !hasUnsafePathCharacters(value);
}

export function normalizePostLoginCallbackUrl(input: string | null | undefined): string {
  if (!input) return DEFAULT_POST_LOGIN_PATH;
  const trimmed = input.trim();
  if (!isSafeLocalCallbackPath(trimmed)) return DEFAULT_POST_LOGIN_PATH;

  let decoded = trimmed;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (!isSafeLocalCallbackPath(next)) return DEFAULT_POST_LOGIN_PATH;
      if (next === decoded) break;
      decoded = next;
    } catch {
      return DEFAULT_POST_LOGIN_PATH;
    }
  }

  return trimmed;
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
