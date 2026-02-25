import { describe, expect, it } from "vitest";
import { ChatRuntime } from "@/lib/server/chat-runtime/runtime";
import { RuntimeThreadContext } from "@/lib/server/chat-runtime/thread";
import type { RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";

describe("chat runtime router + thread context", () => {
  it("runs middleware before handlers", async () => {
    const calls: string[] = [];
    const runtime = new ChatRuntime();
    const emitted: RuntimeStreamEvent[] = [];
    const thread = new RuntimeThreadContext((event) => {
      emitted.push(event);
    });

    runtime.use(async (_ctx, next) => {
      calls.push("mw:before");
      await next();
      calls.push("mw:after");
    });
    runtime.on("content", async ({ event, thread: ctxThread }) => {
      calls.push(`handler:${event.content}`);
      await ctxThread.progress("handled");
    });

    await runtime.dispatch({ type: "content", content: "hello" }, thread);

    expect(calls).toEqual(["mw:before", "handler:hello", "mw:after"]);
    expect(emitted).toEqual([
      {
        type: "progress",
        progressMessage: "handled",
        progressCurrent: undefined,
        progressTotal: undefined,
        conversationId: undefined,
      },
    ]);
  });

  it("applies bound conversation id when thread emits", async () => {
    const emitted: RuntimeStreamEvent[] = [];
    const thread = new RuntimeThreadContext((event) => {
      emitted.push(event);
    }, {
      conversationId: "conv_123",
    });
    await thread.reply("hello");

    expect(emitted).toEqual([
      {
        type: "content",
        content: "hello",
        conversationId: "conv_123",
      },
    ]);
  });
});
