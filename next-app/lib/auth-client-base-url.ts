function isLocalAbsoluteURL(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" && (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}

export function resolveAuthClientBaseURL(input: string | undefined): string | undefined {
  const trimmed = input?.trim();
  if (!trimmed) return undefined;
  return isLocalAbsoluteURL(trimmed) ? undefined : trimmed;
}
