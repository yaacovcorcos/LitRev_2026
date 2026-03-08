import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIErrorWithEnvelope, extractAIErrorEnvelope } from "@/lib/ai/error-envelope";

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
      yield {
        type: "error",
        error: "upstream failed",
        errorMeta: {
          kind: "provider_request",
          code: "UPSTREAM_FAILED",
          retryable: true,
          source: "provider_request",
          message: "upstream failed",
          status: 500,
        },
      };
    });

    const { processAIStream } = await import("@/lib/ai/stream-processor");
    const summary = await processAIStream({
      reader: {} as ReadableStreamDefaultReader<Uint8Array>,
      onChunk: () => {},
    });

    expect(summary.errorMessage).toBe("upstream failed");
    expect(summary.errorMeta).toMatchObject({
      code: "UPSTREAM_FAILED",
      status: 500,
      retryable: true,
    });
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

  it("throws a structured envelope error when configured to throw on error chunks", async () => {
    parseNDJSONStreamMock.mockImplementation(async function* () {
      yield {
        type: "error",
        error: "The model returned invalid arguments for update_protocol.",
        errorMeta: {
          kind: "tool_call_parse",
          code: "TOOL_CALL_ARGS_PARSE_FAILED",
          retryable: false,
          source: "provider_tool_call",
          message: "The model returned invalid arguments for update_protocol.",
        },
      };
    });

    const { processAIStream } = await import("@/lib/ai/stream-processor");

    await expect(processAIStream({
      reader: {} as ReadableStreamDefaultReader<Uint8Array>,
      throwOnErrorChunk: true,
      onChunk: () => {},
    })).rejects.toBeInstanceOf(AIErrorWithEnvelope);
  });

  it("defaults legacy error chunks without metadata to retryable", async () => {
    parseNDJSONStreamMock.mockImplementation(async function* () {
      yield {
        type: "error",
        error: "temporary upstream failure",
      };
    });

    const { processAIStream } = await import("@/lib/ai/stream-processor");

    let thrown: unknown;
    try {
      await processAIStream({
        reader: {} as ReadableStreamDefaultReader<Uint8Array>,
        throwOnErrorChunk: true,
        onChunk: () => {},
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AIErrorWithEnvelope);
    expect(extractAIErrorEnvelope(thrown)?.retryable).toBe(true);
  });
});
