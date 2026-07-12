import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAbortError,
  createDeadlineAbortController,
  createLinkedAbortController,
  isAbortLikeError,
  throwIfAborted,
} from "@/lib/abort";

describe("abort helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("creates and recognizes abort-like errors", () => {
    const error = createAbortError("stop");

    expect(error.name).toBe("AbortError");
    expect(isAbortLikeError(error)).toBe(true);
  });

  it("throws when a signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => throwIfAborted(controller.signal)).toThrowError(/aborted/i);
  });

  it("links multiple abort signals into one disposable execution signal", () => {
    const first = new AbortController();
    const second = new AbortController();
    const linked = createLinkedAbortController([first.signal, second.signal]);

    expect(linked.signal.aborted).toBe(false);
    second.abort();
    expect(linked.signal.aborted).toBe(true);

    linked.dispose();
  });

  it("aborts at a hard deadline and distinguishes timeout from caller cancellation", async () => {
    vi.useFakeTimers();
    const deadline = createDeadlineAbortController(25);

    await vi.advanceTimersByTimeAsync(25);

    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.timedOut()).toBe(true);
    deadline.dispose();

    const caller = new AbortController();
    const callerDeadline = createDeadlineAbortController(100, [caller.signal]);
    caller.abort();
    expect(callerDeadline.signal.aborted).toBe(true);
    expect(callerDeadline.timedOut()).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(callerDeadline.timedOut()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    callerDeadline.dispose();
  });
});
