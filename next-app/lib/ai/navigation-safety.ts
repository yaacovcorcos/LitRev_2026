/**
 * Client-side navigation safety helper.
 * Validates URLs from tool results before allowing router.push().
 * Only allows app-internal paths — rejects external URLs and protocol-relative paths.
 */

const SAFE_PATTERN = /^\/($|project\/[a-zA-Z0-9_-]+(\/(?:protocol|ledger|draft|onboarding))?$)/;

export function isNavigationSafe(url: string): boolean {
    if (!url) return false;
    if (url.startsWith("//") || url.includes("://")) return false;
    return SAFE_PATTERN.test(url);
}
