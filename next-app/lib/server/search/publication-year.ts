export function parsePublicationYearPrefix(value?: string | null): number | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (trimmed.length < 4) return undefined;

  const prefix = trimmed.slice(0, 4);
  if (!/^\d{4}$/.test(prefix)) return undefined;

  const nextChar = trimmed[4];
  if (nextChar && /[A-Za-z0-9]/.test(nextChar)) return undefined;

  const year = parseInt(prefix, 10);
  return Number.isFinite(year) ? year : undefined;
}
