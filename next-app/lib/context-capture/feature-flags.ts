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

export function isContextCaptureV1Enabled(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_CONTEXT_CAPTURE_V1) ?? false;
}

export function isContextHistoryV1Enabled(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_CONTEXT_HISTORY_V1) ?? false;
}

export function isContextToolbarV1Enabled(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_CONTEXT_TOOLBAR_V1) ?? false;
}

