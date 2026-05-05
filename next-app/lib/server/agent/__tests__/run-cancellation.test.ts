import { describe, expect, it } from "vitest";
import {
  abortActiveRunExecution,
  registerActiveRunExecutionCancellation,
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
});
