import { describe, expect, it } from "vitest";
import { buildEvidenceTableMarkdown } from "@/lib/server/agent/artifacts";

describe("buildEvidenceTableMarkdown", () => {
    it("renders markdown table with explicit columns", () => {
        const markdown = buildEvidenceTableMarkdown({
            columns: ["Study", "Outcome"],
            rows: [
                { Study: "Alpha trial", Outcome: "Reduced events" },
                { Study: "Beta | cohort", Outcome: "No\ndifference" },
            ],
        });

        expect(markdown).toContain("## Evidence Table");
        expect(markdown).toContain("| Study | Outcome |");
        expect(markdown).toContain("| --- | --- |");
        expect(markdown).toContain("| Alpha trial | Reduced events |");
        expect(markdown).toContain("| Beta \\| cohort | No difference |");
    });

    it("infers columns from row keys when payload.columns is empty", () => {
        const markdown = buildEvidenceTableMarkdown({
            columns: [],
            rows: [
                { title: "Study 1", year: "2024" },
                { title: "Study 2", year: "2025" },
            ],
        });

        expect(markdown).toContain("| title | year |");
        expect(markdown).toContain("| Study 2 | 2025 |");
    });

    it("returns placeholder when no columns and no rows exist", () => {
        const markdown = buildEvidenceTableMarkdown({
            columns: [],
            rows: [],
        });
        expect(markdown).toContain("_No structured evidence rows were generated._");
    });
});
