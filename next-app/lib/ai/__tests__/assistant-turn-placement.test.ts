import { describe, expect, it } from "vitest";
import { relocateReservedAssistantAfterTraceSuffix } from "@/lib/ai/assistant-turn-placement";

type TestItem =
  | { kind: "assistant"; id: string; reserved?: boolean }
  | { kind: "trace"; id: string }
  | { kind: "progress"; id: string }
  | { kind: "other"; id: string };

function relocate(items: TestItem[], assistantId = "assistant-1") {
  return relocateReservedAssistantAfterTraceSuffix(items, {
    assistantId,
    isReservedAssistant: (item, id) => item.kind === "assistant" && item.id === id && item.reserved === true,
    isMoveableTraceOrProgress: (item) => item.kind === "trace" || item.kind === "progress",
  });
}

describe("relocateReservedAssistantAfterTraceSuffix", () => {
  it("moves a reserved assistant after the contiguous trace/progress suffix without copying it", () => {
    const assistant = { kind: "assistant" as const, id: "assistant-1", reserved: true };
    const items: TestItem[] = [
      { kind: "other", id: "user-1" },
      assistant,
      { kind: "progress", id: "progress-1" },
      { kind: "trace", id: "tool-1" },
    ];

    const next = relocate(items);

    expect(next.map((item) => item.id)).toEqual(["user-1", "progress-1", "tool-1", "assistant-1"]);
    expect(next.filter((item) => item.id === "assistant-1")).toHaveLength(1);
    expect(next[3]).toBe(assistant);
  });

  it("stops before non-moveable items so interactive or exceptional rows stay outside the trace move", () => {
    const items: TestItem[] = [
      { kind: "assistant", id: "assistant-1", reserved: true },
      { kind: "trace", id: "tool-1" },
      { kind: "other", id: "artifact-proposed" },
      { kind: "trace", id: "checkpoint-1" },
    ];

    const next = relocate(items);

    expect(next.map((item) => item.id)).toEqual(["tool-1", "assistant-1", "artifact-proposed", "checkpoint-1"]);
  });

  it("leaves already-valid ordering unchanged", () => {
    const items: TestItem[] = [
      { kind: "trace", id: "tool-1" },
      { kind: "assistant", id: "assistant-1", reserved: true },
    ];

    const next = relocate(items);

    expect(next).toEqual(items);
    expect(next).not.toBe(items);
  });
});
