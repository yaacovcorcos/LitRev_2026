import { describe, expect, it } from "vitest";
import { normalizeStreamChunk, toWireChunk, type RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";

describe("chat runtime events", () => {
  it("normalizes progress chunks with default message", () => {
    const normalized = normalizeStreamChunk({ type: "progress" });
    expect(normalized).toEqual({
      type: "progress",
      progressMessage: "Working...",
      progressCurrent: undefined,
      progressTotal: undefined,
      conversationId: undefined,
    });
  });

  it("drops invalid artifact chunks", () => {
    const normalized = normalizeStreamChunk({ type: "artifact", artifactType: "plan" });
    expect(normalized).toBeNull();
  });

  it("round-trips a content event back to wire format", () => {
    const event: RuntimeStreamEvent = {
      type: "content",
      content: "hello",
      conversationId: "conv_1",
    };
    const wire = toWireChunk(event);
    expect(wire).toEqual({
      type: "content",
      content: "hello",
      conversationId: "conv_1",
    });
  });

  it("normalizes and round-trips reasoning events", () => {
    const normalized = normalizeStreamChunk({
      type: "reasoning_delta",
      reasoningId: "r-1",
      reasoningText: "Thinking...",
      conversationId: "conv_1",
    });
    expect(normalized).toEqual({
      type: "reasoning_delta",
      reasoningId: "r-1",
      reasoningText: "Thinking...",
      conversationId: "conv_1",
    });

    const wire = toWireChunk({
      type: "reasoning_end",
      reasoningId: "r-1",
      conversationId: "conv_1",
    });
    expect(wire).toEqual({
      type: "reasoning_end",
      reasoningId: "r-1",
      conversationId: "conv_1",
    });
  });

  it("normalizes and round-trips navigate events", () => {
    const normalized = normalizeStreamChunk({
      type: "navigate",
      navigateUrl: "/project/p-1/protocol",
      navigateProjectId: "p-1",
      conversationId: "conv_1",
    });
    expect(normalized).toEqual({
      type: "navigate",
      navigateUrl: "/project/p-1/protocol",
      navigateProjectId: "p-1",
      conversationId: "conv_1",
    });

    const wire = toWireChunk({
      type: "navigate",
      navigateUrl: "/project/p-1",
      navigateProjectId: "p-1",
      conversationId: "conv_1",
    });
    expect(wire).toEqual({
      type: "navigate",
      navigateUrl: "/project/p-1",
      navigateProjectId: "p-1",
      conversationId: "conv_1",
    });
  });
});
