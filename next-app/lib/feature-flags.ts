const FALSY = new Set(["0", "false", "off", "no"]);
const TRUTHY = new Set(["1", "true", "on", "yes"]);

function readFlag(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (FALSY.has(normalized)) return false;
  if (TRUTHY.has(normalized)) return true;
  return null;
}

/**
 * A1 rollout gate for scroll ownership behavior.
 * This is a deployment-level gate because NEXT_PUBLIC_* values are embedded
 * into the client bundle at build time.
 */
export function isScrollOwnershipA1Enabled(): boolean {
  return readFlag(process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1) ?? false;
}
