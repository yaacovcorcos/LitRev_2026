import { describe, expect, it } from "vitest";
import { studySchema } from "@/lib/schemas/ledger";

describe("studySchema relevance validation", () => {
  it("accepts relevance payload in details", () => {
    const parsed = studySchema.parse({
      id: "cma1234567890abcde12345",
      title: "Example study",
      authors: "Smith et al.",
      year: 2024,
      status: "active",
      quality: "High",
      details: {
        relevance: {
          score: 82,
          band: "high",
          rationale: "Matches protocol population and outcomes.",
          components: {
            protocolFit: 90,
            applicability: 76,
          },
        },
      },
    });
    expect(parsed.details?.relevance).toBeTruthy();
  });

  it("rejects out-of-range relevance score", () => {
    const result = studySchema.safeParse({
      id: "cma1234567890abcde12345",
      title: "Example study",
      authors: "Smith et al.",
      year: 2024,
      status: "active",
      quality: "High",
      details: {
        relevance: {
          score: 120,
          band: "high",
          rationale: "Invalid score",
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
