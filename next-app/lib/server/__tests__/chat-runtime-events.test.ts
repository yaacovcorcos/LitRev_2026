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
});

