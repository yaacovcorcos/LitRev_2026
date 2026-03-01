/**
 * Network-aware preload gating.
 * Returns true if we should skip expensive preloading
 * (save-data mode or very slow connection).
 */
export function shouldSkipPreload(): boolean {
  if (typeof navigator === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (navigator as any).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  const slow: string[] = ["slow-2g", "2g"];
  if (slow.includes(conn.effectiveType)) return true;
  return false;
}
