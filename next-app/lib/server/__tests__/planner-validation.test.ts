import { describe, it, expect, vi } from "vitest";
import { detectMultiStepWorkflow, validatePlan, generatePlan } from "@/lib/server/agent/planner";
import type { PlanPayload } from "@/types/artifacts";

describe("validatePlan", () => {
    it("accepts a valid plan with known tool names", () => {
        const plan: PlanPayload = {
            steps: [
                { label: "Search", toolName: "search_pubmed", status: "pending" },
                { label: "Screen", toolName: "bulk_screening", status: "pending" },
            ],
            estimatedActions: 2,
        };
        expect(validatePlan(plan)).toEqual(plan);
    });

    it("rejects a step without toolName (generic step)", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const plan: PlanPayload = {
            steps: [{ label: "Process request", description: "Do something", status: "pending" }],
            estimatedActions: 1,
        };
        expect(validatePlan(plan)).toBeNull();
        spy.mockRestore();
    });

    it("returns null for an empty steps array", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = validatePlan({ steps: [], estimatedActions: 0 });
        expect(result).toBeNull();
        spy.mockRestore();
    });

    it("returns null when a step references an unknown tool", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const plan = {
            steps: [{ label: "Bad step", toolName: "nonexistent_tool", status: "pending" }],
            estimatedActions: 1,
        };
        const result = validatePlan(plan);
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("nonexistent_tool"));
        spy.mockRestore();
    });

    it("returns null when Zod validation fails (missing label)", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const plan = {
            steps: [{ toolName: "search_pubmed", status: "pending" }], // missing label
            estimatedActions: 1,
        };
        const result = validatePlan(plan);
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("Zod validation"));
        spy.mockRestore();
    });

    it("returns null when Zod validation fails (invalid status)", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const plan = {
            steps: [{ label: "Step", status: "invalid_status" }],
            estimatedActions: 1,
        };
        const result = validatePlan(plan);
        expect(result).toBeNull();
        spy.mockRestore();
    });

    it("auto-fixes mismatched estimatedActions", () => {
        const plan = {
            steps: [
                { label: "A", toolName: "search_pubmed", status: "pending" as const },
                { label: "B", toolName: "add_to_ledger", status: "pending" as const },
            ],
            estimatedActions: 99, // wrong
        };
        const result = validatePlan(plan);
        expect(result).not.toBeNull();
        expect(result!.estimatedActions).toBe(2);
    });

    it("returns null for completely invalid input", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(validatePlan(null)).toBeNull();
        expect(validatePlan("string")).toBeNull();
        expect(validatePlan(42)).toBeNull();
        expect(validatePlan({})).toBeNull();
        spy.mockRestore();
    });

    it("validates all heuristic tool references are registered", () => {
        // Every toolName the heuristic planner can produce must exist in AVAILABLE_TOOLS
        const toolMessages = [
            "search pubmed",
            "search openalex",
            "extract pdf",
            "screen studies",
            "add to ledger",
            "exclude study",
            "delete study",
            "update criteria",
            "draft section",
        ];
        for (const msg of toolMessages) {
            const plan = validatePlan({
                steps: [{ label: msg, toolName: getHeuristicToolName(msg), status: "pending" }],
                estimatedActions: 1,
            });
            expect(plan, `Plan for "${msg}" should be valid`).not.toBeNull();
        }
    });

    it("rejects a globally-registered tool when mode-filtered allowedToolNames excludes it", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        // search_pubmed is a real tool, but not in the screening mode's allowed list
        const plan = {
            steps: [{ label: "Search", toolName: "search_pubmed", status: "pending" }],
            estimatedActions: 1,
        };
        const result = validatePlan(plan, ["bulk_screening", "exclude_study", "extract_pdf"]);
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("disallowed tool"));
        spy.mockRestore();
    });

    it("accepts a tool that is in the mode-filtered allowedToolNames", () => {
        const plan = {
            steps: [{ label: "Screen", toolName: "bulk_screening", status: "pending" }],
            estimatedActions: 1,
        };
        const result = validatePlan(plan, ["bulk_screening", "exclude_study", "extract_pdf"]);
        expect(result).not.toBeNull();
    });

    it("falls back to global registry when allowedToolNames is undefined", () => {
        const plan = {
            steps: [{ label: "Search", toolName: "search_pubmed", status: "pending" }],
            estimatedActions: 1,
        };
        // No allowedToolNames → uses global AVAILABLE_TOOLS
        expect(validatePlan(plan)).not.toBeNull();
    });
});

describe("generatePlan", () => {
    it("returns a valid plan for a multi-step message", async () => {
        const plan = await generatePlan("search pubmed and then screen the results", {
            projectId: "test",
            hasProtocol: false,
            studyCount: 0,
        });
        expect(plan).not.toBeNull();
        expect(plan!.steps.length).toBeGreaterThanOrEqual(2);
    });

    it("returns null for an unmatched message (non-actionable fallback)", async () => {
        const plan = await generatePlan("hello world", {
            projectId: "test",
            hasProtocol: false,
            studyCount: 0,
        });
        expect(plan).toBeNull();
    });

    it("all generated steps have pending status", async () => {
        const plan = await generatePlan("search and extract and screen", {
            projectId: "test",
            hasProtocol: false,
            studyCount: 0,
        });
        expect(plan).not.toBeNull();
        for (const step of plan!.steps) {
            expect(step.status).toBe("pending");
        }
    });

    it("uses OpenAlex search step when the message explicitly asks for OpenAlex", async () => {
        const plan = await generatePlan("search openalex for broader evidence", {
            projectId: "test",
            hasProtocol: true,
            studyCount: 0,
        });
        expect(plan).not.toBeNull();
        expect(plan!.steps[0]?.toolName).toBe("search_openalex");
    });

    it("does not create a plan for read-only PDF QA prompts", async () => {
        const prompt = "Read the methods section from this study PDF and tell me the intervention and comparator.";
        expect(
            detectMultiStepWorkflow(prompt, ["extract_pdf", "update_note", "read_study_content"]),
        ).toBe(false);

        const plan = await generatePlan(prompt, {
            projectId: "test",
            hasProtocol: true,
            studyCount: 1,
        });
        expect(plan).toBeNull();
    });

    it("still plans draft updates when the user explicitly asks to write and save a section", async () => {
        const prompt = "Write a Methods section summary from this study PDF and save it to the draft.";
        expect(
            detectMultiStepWorkflow(prompt, ["extract_pdf", "update_note", "read_study_content"]),
        ).toBe(false);

        const plan = await generatePlan(prompt, {
            projectId: "test",
            hasProtocol: true,
            studyCount: 1,
        });
        expect(plan).not.toBeNull();
        expect(plan!.steps).toEqual([
            expect.objectContaining({ toolName: "update_note" }),
        ]);
    });

    it("plans PDF extraction only when explicit extraction verbs are present", async () => {
        const prompt = "Extract metadata from this PDF and save the summary to the draft.";
        expect(
            detectMultiStepWorkflow(prompt, ["extract_pdf", "update_note", "read_study_content"]),
        ).toBe(true);

        const plan = await generatePlan(prompt, {
            projectId: "test",
            hasProtocol: true,
            studyCount: 1,
        });
        expect(plan).not.toBeNull();
        expect(plan!.steps.map((step) => step.toolName)).toEqual(["extract_pdf", "update_note"]);
    });
});

// Helper: maps a keyword to the toolName the heuristic planner would produce
function getHeuristicToolName(msg: string): string {
    const map: Record<string, string> = {
        "search pubmed": "search_pubmed",
        "search openalex": "search_openalex",
        "extract pdf": "extract_pdf",
        "screen studies": "bulk_screening",
        "add to ledger": "add_to_ledger",
        "exclude study": "exclude_study",
        "delete study": "delete_study",
        "update criteria": "update_criteria",
        "draft section": "update_note",
    };
    return map[msg] ?? "";
}
