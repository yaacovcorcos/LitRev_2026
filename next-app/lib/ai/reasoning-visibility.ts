import type { ReasoningMode } from "@/types/ai";
import { getReasoningSupportTier } from "@/lib/ai/config";

export const DEFAULT_REASONING_MODE: ReasoningMode = "summary";
export const MAX_REASONING_CHARS = 8000;
export const REASONING_SUMMARY_PREVIEW_CHARS = 500;
const REASONING_MODE_STORAGE_KEY = "litrev-reasoning-mode";

export type ReasoningModeOption = {
  value: ReasoningMode;
  label: string;
  description: string;
};

export const REASONING_MODE_OPTIONS: ReasoningModeOption[] = [
  { value: "off", label: "Off", description: "Show process trace only" },
  { value: "summary", label: "Summary", description: "Show process trace plus a compact summary" },
  { value: "full", label: "Full", description: "Show raw provider reasoning when available" },
];

export function shouldRequestReasoning(mode: ReasoningMode): boolean {
  return mode === "full";
}

/**
 * Conservative per-request reasoning budget for providers that support
 * explicit reasoning controls (for example Anthropic thinking).
 */
export function getReasoningBudgetTokens(mode: ReasoningMode): number | undefined {
  if (mode !== "full") return undefined;
  return 1024;
}

/**
 * Runtime clamp only: keep stored user preference intact, but force requests
 * to "off" when the selected model has no reasoning support.
 */
export function resolveRequestReasoningMode(preferredMode: ReasoningMode, modelId: string): ReasoningMode {
  if (getReasoningSupportTier(modelId) !== "none") {
    return preferredMode;
  }
  return preferredMode === "full" ? "summary" : preferredMode;
}

export function resolveReasoningMode(input?: ReasoningMode, includeReasoning?: boolean): ReasoningMode {
  if (input === "off" || input === "summary" || input === "full") return input;
  if (includeReasoning === true) return "full";
  if (includeReasoning === false) return "off";
  return DEFAULT_REASONING_MODE;
}

export function appendReasoningRaw(
  existing: string,
  delta: string
): { raw: string; truncated: boolean } {
  if (!delta) return { raw: existing, truncated: false };
  const combined = `${existing}${delta}`;
  if (combined.length <= MAX_REASONING_CHARS) {
    return { raw: combined, truncated: false };
  }
  return {
    raw: combined.slice(0, MAX_REASONING_CHARS),
    truncated: true,
  };
}

export function getReasoningSummaryPreview(
  raw: string,
  maxChars = REASONING_SUMMARY_PREVIEW_CHARS
): { text: string; truncated: boolean } {
  if (!raw) return { text: "", truncated: false };
  const trimmed = raw.trim();
  if (trimmed.length <= maxChars) {
    return { text: trimmed, truncated: false };
  }
  return {
    text: `${trimmed.slice(0, maxChars).trimEnd()}...`,
    truncated: true,
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getReasoningModePreference(): ReasoningMode {
  if (!isBrowser()) return DEFAULT_REASONING_MODE;
  const stored = window.localStorage.getItem(REASONING_MODE_STORAGE_KEY);
  return resolveReasoningMode(stored as ReasoningMode | undefined);
}

export function setReasoningModePreference(mode: ReasoningMode): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(REASONING_MODE_STORAGE_KEY, mode);
}
