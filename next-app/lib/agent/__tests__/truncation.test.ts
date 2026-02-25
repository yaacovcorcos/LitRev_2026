import { describe, expect, it } from "vitest";
import {
    truncateToolOutput,
    TOOL_TRUNCATION_MODES,
} from "../truncation";

describe("truncateToolOutput", () => {
    it("returns original content when under limits", () => {
        const content = "short output";
        expect(truncateToolOutput("search_pubmed", content, { maxChars: 100 })).toBe(content);
    });

    it("truncates with head mode and appends marker", () => {
        const content = "A".repeat(200);
        const out = truncateToolOutput("search_pubmed", content, {
            mode: "head",
            maxChars: 50,
            preserveMarkdownFences: false,
        });
        expect(out.startsWith("A".repeat(50))).toBe(true);
        expect(out).toContain("[...truncated");
    });

    it("truncates with tail mode and prepends marker", () => {
        const content = "B".repeat(200);
        const out = truncateToolOutput("bulk_screening", content, {
            mode: "tail",
            maxChars: 50,
            preserveMarkdownFences: false,
        });
        expect(out.endsWith("B".repeat(50))).toBe(true);
        expect(out).toContain("[...truncated");
    });

    it("truncates with both mode preserving both ends", () => {
        const content = "HEAD-" + "C".repeat(200) + "-TAIL";
        const out = truncateToolOutput("extract_pdf", content, {
            mode: "both",
            maxChars: 60,
            preserveMarkdownFences: false,
        });
        expect(out).toContain("HEAD-");
        expect(out).toContain("-TAIL");
        expect(out).toContain("[...truncated");
    });

    it("respects line budget", () => {
        const content = Array.from({ length: 20 }, (_, i) => `line-${i}`).join("\n");
        const out = truncateToolOutput("search_pubmed", content, {
            mode: "head",
            maxChars: 10_000,
            maxLines: 5,
            preserveMarkdownFences: false,
        });
        expect(out).toContain("line-0");
        expect(out).toContain("line-4");
        expect(out).not.toContain("line-10");
    });

    it("uses tool-specific mode mapping by default", () => {
        expect(TOOL_TRUNCATION_MODES.bulk_screening).toBe("tail");
        const content = "12345".repeat(80);
        const out = truncateToolOutput("bulk_screening", content, {
            maxChars: 40,
            preserveMarkdownFences: false,
        });
        expect(out.endsWith(content.slice(-40))).toBe(true);
    });

    it("closes open markdown fence when head-truncating inside fence", () => {
        const content = [
            "Before",
            "```ts",
            "const a = 1;",
            "const b = 2;",
            "const c = 3;",
            "```",
            "After",
        ].join("\n");

        const out = truncateToolOutput("extract_pdf", content, {
            mode: "head",
            maxChars: 30,
            preserveMarkdownFences: true,
        });
        expect(out).toContain("```");
        expect(out).toContain("[...truncated");
    });

    it("reopens markdown fence when tail-truncating inside fence", () => {
        const content = [
            "Before",
            "```python",
            "print('a')",
            "print('b')",
            "print('c')",
            "```",
            "After",
        ].join("\n");

        const out = truncateToolOutput("bulk_screening", content, {
            mode: "tail",
            maxChars: 30,
            preserveMarkdownFences: true,
        });
        expect(out).toContain("[...truncated");
        expect(out).toContain("```");
    });
});
