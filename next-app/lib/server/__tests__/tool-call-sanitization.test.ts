import { describe, expect, it } from "vitest";
import { dropShadowedInvalidToolCalls } from "@/lib/server/ai/tool-helpers";

describe("dropShadowedInvalidToolCalls", () => {
  it("drops malformed update_protocol calls when a valid sibling proposal exists", () => {
    const result = dropShadowedInvalidToolCalls([
      {
        id: "bad",
        name: "update_protocol",
        arguments: {
          field: "methodology.qualityAssessmentTool",
          value: { label: "GRADE" },
          rationale: "User asked for GRADE",
        },
      },
      {
        id: "good",
        name: "update_protocol",
        arguments: {
          field: "methodology.qualityAssessmentTool",
          value: "GRADE",
          rationale: "User asked for GRADE",
        },
      },
      {
        id: "other",
        name: "inspect_memory",
        arguments: {},
      },
    ]);

    expect(result.toolCalls.map((toolCall) => toolCall.id)).toEqual(["good", "other"]);
    expect(result.dropped).toEqual([
      {
        id: "bad",
        name: "update_protocol",
        reason: "Quality Assessment Tool expects a string, got an object",
      },
    ]);
  });

  it("keeps a malformed update_protocol call when no valid sibling exists", () => {
    const result = dropShadowedInvalidToolCalls([
      {
        id: "bad",
        name: "update_protocol",
        arguments: {
          field: "methodology.studyDesigns",
          value: { items: ["RCT"] },
          rationale: "User asked for RCTs",
        },
      },
    ]);

    expect(result.toolCalls.map((toolCall) => toolCall.id)).toEqual(["bad"]);
    expect(result.dropped).toEqual([]);
  });
});
