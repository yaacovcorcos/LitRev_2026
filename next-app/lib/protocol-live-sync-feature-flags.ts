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

export function isProtocolLiveSyncV1Enabled(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_PROTOCOL_LIVE_SYNC_V1) ?? true;
}
