import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  logServerError: vi.fn(),
  logServerWarn: vi.fn(),
}));

vi.mock("@/lib/server/ai/ai-service", () => ({
  getAIService: () => ({
    chat: mocks.chat,
  }),
}));

vi.mock("@/lib/server/logging", () => ({
  logServerError: mocks.logServerError,
  logServerWarn: mocks.logServerWarn,
}));

const { quickExtractWithAI } = await import("@/lib/server/pdf-extraction");

describe("pdf extraction log redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not log raw AI response content when JSON parsing fails", async () => {
    const sensitiveContent = "Patient SSN 123-45-6789";
    mocks.chat.mockResolvedValue({
      content: `not-json ${sensitiveContent}`,
    });

    const result = await quickExtractWithAI("pdf text", {}, "proj-1");

    expect(result).toEqual({ details: {}, confidence: {} });
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    expect(mocks.logServerError).toHaveBeenCalledWith(
      "pdf-extraction",
      "failed to parse AI response as JSON",
      expect.objectContaining({
        responseLength: expect.any(Number),
        trimmedLength: expect.any(Number),
        jsonLength: expect.any(Number),
      }),
    );

    const context = mocks.logServerError.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(context).not.toHaveProperty("content");
    expect(JSON.stringify(context)).not.toContain(sensitiveContent);
  });
});
