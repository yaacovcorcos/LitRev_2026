import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";
import { StreamCoalescer } from "@/lib/server/ai/stream-coalescer";

describe("StreamCoalescer", () => {
  const emitted: RuntimeStreamEvent[] = [];

  beforeEach(() => {
    emitted.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces content chunks and emits on flush", async () => {
    const coalescer = new StreamCoalescer({
      minChars: 4,
      maxChars: 16,
      idleMs: 1000,
      onEmit: (event) => {
        emitted.push(event);
      },
    });

    await coalescer.push({ type: "content", content: "Hello " });
    await coalescer.push({ type: "content", content: "world" });
    expect(emitted).toHaveLength(0);

    await coalescer.flushAll();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ type: "content", content: "Hello world", conversationId: undefined });
  });

  it("flushes automatically when max chars is reached", async () => {
    const coalescer = new StreamCoalescer({
      minChars: 1,
      maxChars: 10,
      idleMs: 1000,
      onEmit: (event) => {
        emitted.push(event);
      },
    });

    await coalescer.push({ type: "content", content: "12345" });
    await coalescer.push({ type: "content", content: "67890abc" });

    expect(emitted.length).toBeGreaterThanOrEqual(1);
    expect(emitted[0]?.type).toBe("content");
    if (emitted[0]?.type === "content") {
      expect(emitted[0].content.length).toBeLessThanOrEqual(10);
    }

    await coalescer.flushAll();
    expect(
      emitted
        .filter((event): event is Extract<RuntimeStreamEvent, { type: "content" }> => event.type === "content")
        .map((event) => event.content)
        .join("")
    ).toBe("1234567890abc");
  });

  it("flushes buffered output after idle timeout", async () => {
    vi.useFakeTimers();
    const coalescer = new StreamCoalescer({
      minChars: 100,
      maxChars: 200,
      idleMs: 500,
      onEmit: (event) => {
        emitted.push(event);
      },
    });

    await coalescer.push({ type: "content", content: "short" });
    expect(emitted).toHaveLength(0);

    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ type: "content", content: "short", conversationId: undefined });
  });

  it("flushes pending chunks before emitting non-coalescible events", async () => {
    const coalescer = new StreamCoalescer({
      minChars: 4,
      maxChars: 20,
      idleMs: 1000,
      onEmit: (event) => {
        emitted.push(event);
      },
    });

    await coalescer.push({ type: "content", content: "buffered text" });
    await coalescer.push({ type: "done" });

    expect(emitted).toHaveLength(2);
    expect(emitted[0]?.type).toBe("content");
    expect(emitted[1]?.type).toBe("done");
  });

  it("waits for a safe markdown fence boundary when possible", async () => {
    const coalescer = new StreamCoalescer({
      minChars: 1,
      maxChars: 20,
      idleMs: 1000,
      onEmit: (event) => {
        emitted.push(event);
      },
    });

    await coalescer.push({ type: "content", content: "```ts\nconst x = 1;\n" });
    expect(emitted).toHaveLength(0);

    await coalescer.push({ type: "content", content: "console.log(x);\n```\nAfter fence." });
    await coalescer.flushAll();

    const merged = emitted
      .filter((event): event is Extract<RuntimeStreamEvent, { type: "content" }> => event.type === "content")
      .map((event) => event.content)
      .join("");

    expect(merged).toBe("```ts\nconst x = 1;\nconsole.log(x);\n```\nAfter fence.");
  });
});
