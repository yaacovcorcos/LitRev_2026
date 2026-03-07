import { describe, expect, it } from "vitest";
import { normalizeAndClassifyProtocolMutation, validateFieldValue } from "@/lib/protocol-fields";

describe("normalizeAndClassifyProtocolMutation", () => {
  it("normalizes a singleton array into a scalar string field", () => {
    const result = normalizeAndClassifyProtocolMutation("researchQuestion", ["What is the effect?"]);

    expect(result).toMatchObject({
      valid: true,
      value: "What is the effect?",
      normalized: true,
      normalization: "single_item_array_to_scalar",
    });
  });

  it("normalizes a scalar into a single-item array field", () => {
    const result = normalizeAndClassifyProtocolMutation("eligibility.inclusion", "Adults with obesity");

    expect(result).toMatchObject({
      valid: true,
      value: ["Adults with obesity"],
      normalized: true,
      normalization: "scalar_to_single_item_array",
    });
  });

  it("unwraps an unambiguous object wrapper for string fields", () => {
    const result = normalizeAndClassifyProtocolMutation("methodology.qualityAssessmentTool", { value: "GRADE" });

    expect(result).toMatchObject({
      valid: true,
      value: "GRADE",
      normalized: true,
      normalization: "object_value_unwrap",
    });
  });

  it("rejects ambiguous object wrappers", () => {
    const result = normalizeAndClassifyProtocolMutation("methodology.qualityAssessmentTool", { label: "GRADE" });

    expect(result).toMatchObject({
      valid: false,
      code: "AMBIGUOUS_VALUE_WRAPPER",
      error: "Quality Assessment Tool expects a string, got an unsupported object shape",
    });
  });

  it("rejects multi-item arrays for scalar fields", () => {
    const result = normalizeAndClassifyProtocolMutation("researchQuestion", ["One", "Two"]);

    expect(result).toMatchObject({
      valid: false,
      code: "STRING_EXPECTS_SINGLE_VALUE",
    });
  });

  it("rejects excessively nested wrapper values", () => {
    const result = normalizeAndClassifyProtocolMutation("researchQuestion", {
      value: {
        value: {
          value: {
            value: {
              value: "Too deep",
            },
          },
        },
      },
    });

    expect(result).toMatchObject({
      valid: false,
      code: "VALUE_NESTING_TOO_DEEP",
      error: "Research Question value nesting is too deep to normalize safely",
    });
  });
});

describe("validateFieldValue", () => {
  it("preserves compatibility by returning the normalized value", () => {
    const result = validateFieldValue("methodology.studyDesigns", { items: ["RCT", "Cohort"] });

    expect(result).toEqual({
      valid: true,
      value: ["RCT", "Cohort"],
    });
  });
});
