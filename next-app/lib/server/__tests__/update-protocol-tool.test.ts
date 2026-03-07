import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateProtocolTool } from "@/lib/server/ai/tools/update-protocol";

const mockEnsureProtocol = vi.fn();

vi.mock("@/lib/server/protocols", () => ({
  ensureProtocol: (...args: unknown[]) => mockEnsureProtocol(...args),
}));

describe("updateProtocolTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureProtocol.mockResolvedValue({
      researchQuestion: "Old question",
      pico: {
        population: "",
        intervention: "",
        comparison: "",
        outcome: "",
      },
      eligibility: {
        inclusion: [],
        exclusion: [],
      },
      searchStrategy: {
        query: "",
        databases: [],
      },
      methodology: {
        studyDesigns: [],
        timeFrameStart: "",
        timeFrameEnd: "",
        qualityAssessmentTool: "",
        qualityAssessmentNotes: "",
      },
    });
  });

  it("declares an explicit value schema for tool-calling providers", () => {
    const valueSchema = (updateProtocolTool.definition.parameters.properties as Record<string, unknown>).value as Record<string, unknown>;
    expect(valueSchema.anyOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "string" }),
        expect.objectContaining({ type: "number" }),
        expect.objectContaining({ type: "boolean" }),
        expect.objectContaining({ type: "array" }),
      ])
    );
  });

  it("coerces primitive scalar values through field-specific validation", async () => {
    const result = await updateProtocolTool.execute(
      {
        field: "methodology.timeFrameStart",
        value: 2018,
        rationale: "The user wants a 2018 start date",
      },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      field: "methodology.timeFrameStart",
      value: "2018",
      oldValue: "",
      rationale: "The user wants a 2018 start date",
    });
  });

  it("normalizes unambiguous object wrappers for string fields", async () => {
    const result = await updateProtocolTool.execute(
      {
        field: "researchQuestion",
        value: { text: "New question" },
        rationale: "The user refined the question",
      },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      field: "researchQuestion",
      value: "New question",
      oldValue: "Old question",
      rationale: "The user refined the question",
    });
  });

  it("returns a field-specific error for unsupported object wrappers", async () => {
    const result = await updateProtocolTool.execute(
      {
        field: "researchQuestion",
        value: { label: "New question" },
        rationale: "The user refined the question",
      },
      { projectId: "proj-1" }
    );

    expect(result.result).toBeNull();
    expect(result.error).toBe("Research Question expects a string, got an unsupported object shape");
  });
});
