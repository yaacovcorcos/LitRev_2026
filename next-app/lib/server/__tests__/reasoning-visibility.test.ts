import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REASONING_MODE,
  getReasoningBudgetTokens,
  getReasoningModePreference,
  getReasoningSummaryPreview,
  setReasoningModePreference,
} from "@/lib/ai/reasoning-visibility";

function withMockWindow() {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  };
  vi.stubGlobal("window", { localStorage });
  return storage;
}

describe("reasoning visibility helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses full mode as default when no preference is stored", () => {
    withMockWindow();
    expect(getReasoningModePreference()).toBe(DEFAULT_REASONING_MODE);
  });

  it("reads and writes reasoning mode preference", () => {
    withMockWindow();
    setReasoningModePreference("summary");
    expect(getReasoningModePreference()).toBe("summary");
    setReasoningModePreference("off");
    expect(getReasoningModePreference()).toBe("off");
  });

  it("falls back to default mode for invalid stored values", () => {
    const storage = withMockWindow();
    storage.set("litrev-reasoning-mode", "invalid-value");
    expect(getReasoningModePreference()).toBe(DEFAULT_REASONING_MODE);
  });

  it("creates summary previews with truncation metadata", () => {
    const longText = "a".repeat(700);
    const preview = getReasoningSummaryPreview(longText, 500);
    expect(preview.truncated).toBe(true);
    expect(preview.text.length).toBe(503);
  });

  it("returns conservative reasoning budgets by mode", () => {
    expect(getReasoningBudgetTokens("off")).toBeUndefined();
    expect(getReasoningBudgetTokens("summary")).toBe(512);
    expect(getReasoningBudgetTokens("full")).toBe(1024);
  });
});
