import { describe, expect, it, vi } from "vitest";
import {
  abortActiveRunExecution,
  registerActiveRunExecutionCancellation,
  startDurableRunCancellationMonitor,
} from "@/lib/server/agent/run-cancellation";

describe("run cancellation registry", () => {
  it("aborts the active in-process execution signal for a run", () => {
    const registered = registerActiveRunExecutionCancellation("run-1");

    expect(registered.signal.aborted).toBe(false);
    expect(abortActiveRunExecution("run-1")).toBe(true);
    expect(registered.signal.aborted).toBe(true);

    registered.dispose();
  });

  it("removes disposed run registrations", () => {
    const registered = registerActiveRunExecutionCancellation("run-disposed");
    registered.dispose();

    expect(abortActiveRunExecution("run-disposed")).toBe(false);
  });

  it("aborts execution when durable run status is no longer running", async () => {
    const ticks: Array<() => void | Promise<void>> = [];
    const timer = { unref: vi.fn() } as unknown as ReturnType<typeof setInterval>;
    const schedule = vi.fn((callback: () => void | Promise<void>) => {
      ticks.push(callback);
      return timer;
    });
    const cancel = vi.fn();
    const abort = vi.fn();

    startDurableRunCancellationMonitor("run-1", {
      abort,
      pollStatus: vi.fn(async () => "cancelled"),
      schedule,
      cancel,
      intervalMs: 10,
    });

    await ticks[0]?.();

    expect(abort).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(timer);
  });

  it("keeps polling while durable run status remains running", async () => {
    const ticks: Array<() => void | Promise<void>> = [];
    const timer = { unref: vi.fn() } as unknown as ReturnType<typeof setInterval>;
    const schedule = vi.fn((callback: () => void | Promise<void>) => {
      ticks.push(callback);
      return timer;
    });
    const cancel = vi.fn();
    const abort = vi.fn();

    const monitor = startDurableRunCancellationMonitor("run-1", {
      abort,
      pollStatus: vi.fn(async () => "running"),
      schedule,
      cancel,
      intervalMs: 10,
    });

    await ticks[0]?.();
    monitor.stop();

    expect(abort).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(timer);
  });

  it("does not overlap slow durable status polls", async () => {
    const ticks: Array<() => void | Promise<void>> = [];
    const pollControl: { resolve?: (status: string) => void } = {};
    const pollStatus = vi.fn(() => new Promise<string>((resolve) => {
      pollControl.resolve = resolve;
    }));
    const schedule = vi.fn((callback: () => void | Promise<void>) => {
      ticks.push(callback);
      return { unref: vi.fn() } as unknown as ReturnType<typeof setInterval>;
    });

    startDurableRunCancellationMonitor("run-1", {
      abort: vi.fn(),
      pollStatus,
      schedule,
      cancel: vi.fn(),
      intervalMs: 10,
    });

    const firstTick = ticks[0]?.();
    await ticks[0]?.();
    pollControl.resolve?.("running");
    await firstTick;

    expect(pollStatus).toHaveBeenCalledTimes(1);
  });
});
