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

const DEFAULT_CITATION_HOVER_PREFETCH_ENABLED = true;
const DEFAULT_CITATION_PREVIEW_TELEMETRY_SHIPPING_ENABLED = false;

export function isCitationHoverPrefetchEnabled(): boolean {
    const publicFlag = readFlag(process.env.NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH);
    if (publicFlag !== null) return publicFlag;
    return DEFAULT_CITATION_HOVER_PREFETCH_ENABLED;
}

export function isCitationPreviewTelemetryShippingEnabled(): boolean {
    const publicFlag = readFlag(process.env.NEXT_PUBLIC_ENABLE_CITATION_PREVIEW_TELEMETRY_SHIPPING);
    if (publicFlag !== null) return publicFlag;
    const serverFlag = readFlag(process.env.ENABLE_CITATION_PREVIEW_TELEMETRY_SHIPPING);
    if (serverFlag !== null) return serverFlag;
    return DEFAULT_CITATION_PREVIEW_TELEMETRY_SHIPPING_ENABLED;
}
