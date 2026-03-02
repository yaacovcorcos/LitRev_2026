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

const DEFAULT_POPUP_TOOLS_ENABLED = true;
const DEFAULT_AI_ACTION_BUTTON_ENABLED = true;
const DEFAULT_PROPOSE_MODE_ENABLED = true;
const DEFAULT_AUTOFILL_ENABLED = true;

export function isPopupToolsEnabled(): boolean {
    const publicFlag = readFlag(process.env.NEXT_PUBLIC_ENABLE_POPUP_TOOLS);
    if (publicFlag !== null) return publicFlag;
    const serverFlag = readFlag(process.env.ENABLE_POPUP_TOOLS);
    if (serverFlag !== null) return serverFlag;
    return DEFAULT_POPUP_TOOLS_ENABLED;
}

export function isAIActionButtonEnabled(): boolean {
    const value = readFlag(process.env.NEXT_PUBLIC_ENABLE_AI_ACTION_BUTTON);
    if (value !== null) return value;
    return DEFAULT_AI_ACTION_BUTTON_ENABLED;
}

export function isProposeModeEnabled(): boolean {
    const value = readFlag(process.env.NEXT_PUBLIC_ENABLE_AI_PROPOSE_MODE);
    if (value !== null) return value;
    return DEFAULT_PROPOSE_MODE_ENABLED;
}

export function isAutofillModeEnabled(): boolean {
    const value = readFlag(process.env.NEXT_PUBLIC_ENABLE_AI_AUTOFILL_MODE);
    if (value !== null) return value;
    return DEFAULT_AUTOFILL_ENABLED;
}
