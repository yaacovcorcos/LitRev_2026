// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAsyncAction,
  NOTIFICATION_EVENT,
  type NotificationEventDetail,
} from "../useAsyncAction";

describe("useAsyncAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in idle status with no error", () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => {}),
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("transitions through loading → success → idle", async () => {
    let resolve!: () => void;
    const action = vi.fn(
      () => new Promise<void>((r) => { resolve = r; }),
    );

    const { result } = renderHook(() => useAsyncAction(action));

    // Execute — should go to loading
    let promise: Promise<void | undefined>;
    act(() => {
      promise = result.current.execute();
    });
    expect(result.current.status).toBe("loading");

    // Resolve — should go to success
    await act(async () => {
      resolve();
      await promise!;
    });
    expect(result.current.status).toBe("success");

    // Auto-reset after 2000ms
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.status).toBe("idle");
  });

  it("transitions to error on rejection and stays there", async () => {
    const action = vi.fn(async () => {
      throw new Error("test failure");
    });

    const { result } = renderHook(() => useAsyncAction(action));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("test failure");

    // Error state persists — no auto-reset
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.status).toBe("error");
  });

  it("uses fallback errorMessage when error has no message", async () => {
    const action = vi.fn(async () => {
      throw new Error();
    });

    const { result } = renderHook(() =>
      useAsyncAction(action, { errorMessage: "Custom fallback" }),
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBe("Custom fallback");
  });

  it("prevents double-execution while loading", async () => {
    let resolve!: () => void;
    const action = vi.fn(
      () => new Promise<void>((r) => { resolve = r; }),
    );

    const { result } = renderHook(() => useAsyncAction(action));

    act(() => {
      void result.current.execute();
    });
    expect(result.current.status).toBe("loading");

    // Second call should be a no-op
    let secondResult: unknown;
    act(() => {
      secondResult = result.current.execute();
    });

    expect(action).toHaveBeenCalledTimes(1);

    // Clean up
    await act(async () => {
      resolve();
      await secondResult;
    });
  });

  it("does not auto-reset when resetDelay is 0", async () => {
    const action = vi.fn(async () => {});

    const { result } = renderHook(() =>
      useAsyncAction(action, { resetDelay: 0 }),
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.status).toBe("success");

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.status).toBe("success");
  });

  it("resets to idle when reset() is called", async () => {
    const action = vi.fn(async () => {
      throw new Error("fail");
    });

    const { result } = renderHook(() => useAsyncAction(action));

    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.status).toBe("error");

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("dispatches success notification event", async () => {
    const action = vi.fn(async () => {});
    const events: NotificationEventDetail[] = [];
    const handler = (e: Event) => {
      events.push((e as CustomEvent<NotificationEventDetail>).detail);
    };
    window.addEventListener(NOTIFICATION_EVENT, handler);

    const { result } = renderHook(() =>
      useAsyncAction(action, { successMessage: "Saved!" }),
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "success", message: "Saved!" });

    window.removeEventListener(NOTIFICATION_EVENT, handler);
  });

  it("dispatches error notification event", async () => {
    const action = vi.fn(async () => {
      throw new Error("boom");
    });
    const events: NotificationEventDetail[] = [];
    const handler = (e: Event) => {
      events.push((e as CustomEvent<NotificationEventDetail>).detail);
    };
    window.addEventListener(NOTIFICATION_EVENT, handler);

    const { result } = renderHook(() => useAsyncAction(action));

    await act(async () => {
      await result.current.execute();
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "error", message: "boom" });

    window.removeEventListener(NOTIFICATION_EVENT, handler);
  });

  it("returns the action result on success", async () => {
    const action = vi.fn(async () => 42);

    const { result } = renderHook(() => useAsyncAction(action));

    let returned: number | undefined;
    await act(async () => {
      returned = await result.current.execute();
    });

    expect(returned).toBe(42);
  });

  it("supports cancellation via AbortSignal", async () => {
    let signalRef!: AbortSignal;
    const action = vi.fn(async (signal: AbortSignal) => {
      signalRef = signal;
      return new Promise<void>((_, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });

    const { result } = renderHook(() =>
      useAsyncAction(action, { cancellable: true }),
    );

    let promise: Promise<void | undefined>;
    act(() => {
      promise = result.current.execute();
    });
    expect(result.current.status).toBe("loading");

    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      await promise!;
    });

    expect(signalRef.aborted).toBe(true);
    expect(result.current.status).toBe("cancelled");
  });
});
