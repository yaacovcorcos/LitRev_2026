import { beforeEach, describe, expect, it, vi } from "vitest";

const parseNDJSONStreamMock = vi.fn();

vi.mock("@/lib/ai/stream-parser", () => ({
  parseNDJSONStream: (...args: unknown[]) => parseNDJSONStreamMock(...args),
}));

describe("processAIStream terminal lifecycle", () => {
  beforeEach(() => {
    parseNDJSONStreamMock.mockReset();
  });

  it("returns completed when run_end reports completed", async () => {
    parseNDJSONStreamMock.mockImplementation(async function* () {
      yield { type: "run_start", conversationId: "conv-1" };
      yield { type: "content", content: "hi" };
      yield { type: "run_end", runStatus: "completed", stopReason: null };
    });

    const { processAIStream } = await import("@/lib/ai/stream-processor");
    const summary = await processAIStream({
      reader: {} as ReadableStreamDefaultReader<Uint8Array>,
      onChunk: () => {},
    });

    expect(summary.conversationId).toBe("conv-1");
    expect(summary.terminalReason).toBe("completed");
  });

  it("returns failed_server when stream emits error chunk", async () => {
    parseNDJSONStreamMock.mockImplementation(async function* () {
      yield { type: "error", error: "upstream failed", errorStatus: 500 };
    });

    const { processAIStream } = await import("@/lib/ai/stream-processor");
    const summary = await processAIStream({
      reader: {} as ReadableStreamDefaultReader<Uint8Array>,
      onChunk: () => {},
    });

    expect(summary.errorMessage).toBe("upstream failed");
    expect(summary.terminalReason).toBe("failed_server");
  });

  it("returns failed_network when stream ends without run_end or error", async () => {
    parseNDJSONStreamMock.mockImplementation(async function* () {
      yield { type: "content", content: "partial" };
    });

    const { processAIStream } = await import("@/lib/ai/stream-processor");
    const summary = await processAIStream({
      reader: {} as ReadableStreamDefaultReader<Uint8Array>,
      onChunk: () => {},
    });

    expect(summary.terminalReason).toBe("failed_network");
  });
});
