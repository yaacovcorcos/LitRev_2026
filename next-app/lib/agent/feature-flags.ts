import type { AgentMode } from "@/types/agent";

const DEFAULT_SCOPING_ENABLED = true;
const DEFAULT_SCOPING_CARD_V2_ENABLED = true;
const DEFAULT_CHAT_STUDY_MENTIONS_ENABLED = true;
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

export function isScopingModeEnabled(): boolean {
    const fromPublic = readFlag(process.env.NEXT_PUBLIC_ENABLE_SCOPING_MODE);
    if (fromPublic !== null) return fromPublic;
    const fromServer = readFlag(process.env.ENABLE_SCOPING_MODE);
    if (fromServer !== null) return fromServer;
    return DEFAULT_SCOPING_ENABLED;
}

export function isScopingDecisionCardV2Enabled(): boolean {
    const value = readFlag(process.env.NEXT_PUBLIC_SCOPING_DECISION_CARD_V2);
    if (value !== null) return value;
    return DEFAULT_SCOPING_CARD_V2_ENABLED;
}

export function isChatStudyMentionsEnabled(): boolean {
    const value = readFlag(process.env.NEXT_PUBLIC_CHAT_STUDY_MENTIONS_V1);
    if (value !== null) return value;
    return DEFAULT_CHAT_STUDY_MENTIONS_ENABLED;
}

const DEFAULT_DELEGATION_ENABLED = false;
const DEFAULT_TIERED_SCREENING_ENABLED = false;
const DEFAULT_OA_PDF_FETCH_ENABLED = false;

export function isDelegationEnabled(): boolean {
    const fromPublic = readFlag(process.env.NEXT_PUBLIC_ENABLE_DELEGATION);
    if (fromPublic !== null) return fromPublic;
    const fromServer = readFlag(process.env.ENABLE_DELEGATION);
    if (fromServer !== null) return fromServer;
    return DEFAULT_DELEGATION_ENABLED;
}

export function isTieredScreeningEnabled(): boolean {
    const fromPublic = readFlag(process.env.NEXT_PUBLIC_ENABLE_TIERED_SCREENING);
    if (fromPublic !== null) return fromPublic;
    const fromServer = readFlag(process.env.ENABLE_TIERED_SCREENING);
    if (fromServer !== null) return fromServer;
    return DEFAULT_TIERED_SCREENING_ENABLED;
}

export function isOpenAccessPdfFetchEnabled(): boolean {
    const fromPublic = readFlag(process.env.NEXT_PUBLIC_ENABLE_OA_PDF_FETCH);
    if (fromPublic !== null) return fromPublic;
    const fromServer = readFlag(process.env.ENABLE_OA_PDF_FETCH);
    if (fromServer !== null) return fromServer;
    return DEFAULT_OA_PDF_FETCH_ENABLED;
}

export function normalizeAgentMode(requested: AgentMode): AgentMode {
    if (requested !== "scoping") return requested;
    return isScopingModeEnabled() ? "scoping" : "search";
}

export function getUserSelectableAgentModes(): AgentMode[] {
    const base: AgentMode[] = ["general", "protocol", "search", "screening", "drafting", "qa"];
    if (!isScopingModeEnabled()) return base;
    return ["general", "protocol", "scoping", "search", "screening", "drafting", "qa"];
}
