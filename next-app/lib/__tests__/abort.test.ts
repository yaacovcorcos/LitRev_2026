import { describe, expect, it } from "vitest";
import {
  createAbortError,
  createLinkedAbortController,
  isAbortLikeError,
  throwIfAborted,
} from "@/lib/abort";

describe("abort helpers", () => {
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
});
