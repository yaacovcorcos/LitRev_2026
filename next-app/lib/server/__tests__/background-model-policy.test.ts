import { beforeEach, describe, expect, it, vi } from "vitest";

const isModelConfigured = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/ai/model-availability", () => ({
  isModelConfigured,
}));

import {
  BackgroundModelUnavailableError,
  getBackgroundModel,
} from "@/lib/server/ai/background-model-policy";

describe("background model policy", () => {
  beforeEach(() => {
    isModelConfigured.mockReset();
  });

  it("prefers the purpose-specific gateway model when it is configured", () => {
    isModelConfigured.mockImplementation((modelId: string) => modelId === "deepseek-v4-pro");

    expect(getBackgroundModel("analysis")).toBe("deepseek-v4-pro");
  });

  it("selects another configured portfolio route instead of an unavailable Luna", () => {
    isModelConfigured.mockImplementation((modelId: string) => modelId === "grok-4.5");

    expect(getBackgroundModel("fast")).toBe("grok-4.5");
  });

  it("uses Luna when the preferred route is unavailable but Luna is configured", () => {
    isModelConfigured.mockImplementation((modelId: string) => modelId === "gpt-5.6-luna");

    expect(getBackgroundModel("analysis")).toBe("gpt-5.6-luna");
  });

  it("fails with a typed no-route error when no portfolio model is configured", () => {
    isModelConfigured.mockReturnValue(false);

    expect(() => getBackgroundModel("fast")).toThrow(BackgroundModelUnavailableError);
    expect(() => getBackgroundModel("fast")).toThrow(/No configured model/);
  });
});
