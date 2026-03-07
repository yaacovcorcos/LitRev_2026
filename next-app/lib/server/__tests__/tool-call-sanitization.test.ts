import { describe, expect, it } from "vitest";
import { dropShadowedInvalidToolCalls, getToolCallRepeatKey } from "@/lib/server/ai/tool-helpers";

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
        reason: "Quality Assessment Tool expects a string, got an unsupported object shape",
      },
    ]);
  });

  it("keeps a malformed update_protocol call when no valid sibling exists for that field", () => {
    const result = dropShadowedInvalidToolCalls([
      {
        id: "bad",
        name: "update_protocol",
        arguments: {
          field: "methodology.studyDesigns",
          value: { label: "RCT" },
          rationale: "User asked for RCTs",
        },
      },
      {
        id: "good-other-field",
        name: "update_protocol",
        arguments: {
          field: "methodology.qualityAssessmentTool",
          value: "GRADE",
          rationale: "User asked for GRADE",
        },
      },
    ]);

    expect(result.toolCalls.map((toolCall) => toolCall.id)).toEqual(["bad", "good-other-field"]);
    expect(result.dropped).toEqual([]);
  });

  it("drops duplicate malformed update_protocol siblings for the same semantic failure", () => {
    const result = dropShadowedInvalidToolCalls([
      {
        id: "bad-1",
        name: "update_protocol",
        arguments: {
          field: "researchQuestion",
          value: ["One", "Two"],
          rationale: "User asked to update the question",
        },
      },
      {
        id: "bad-2",
        name: "update_protocol",
        arguments: {
          field: "researchQuestion",
          value: ["Three", "Four"],
          rationale: "User asked to update the question",
        },
      },
    ]);

    expect(result.toolCalls.map((toolCall) => toolCall.id)).toEqual(["bad-1"]);
    expect(result.dropped).toEqual([
      {
        id: "bad-2",
        name: "update_protocol",
        reason: "Research Question expects a single string value, got an array",
      },
    ]);
  });

  it("uses normalized repeat keys so equivalent valid calls hash the same", () => {
    const scalarCall = {
      id: "scalar",
      name: "update_protocol" as const,
      arguments: {
        field: "researchQuestion",
        value: "What is the effect?",
        rationale: "User asked to update the question",
      },
    };
    const singletonArrayCall = {
      id: "array",
      name: "update_protocol" as const,
      arguments: {
        field: "researchQuestion",
        value: ["What is the effect?"],
        rationale: "User asked to update the question",
      },
    };

    expect(getToolCallRepeatKey(singletonArrayCall)).toBe(getToolCallRepeatKey(scalarCall));
  });
});
