import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncProtocolToMemory } from "../memory/protocol-sync";
import type { ProtocolData } from "@/types/protocol";

// Mock the project-memory CRUD functions
vi.mock("@/lib/server/memory/project-memory", () => ({
    createProjectMemory: vi.fn().mockResolvedValue({ id: "new-id" }),
    getProjectMemories: vi.fn().mockResolvedValue([]),
    updateProjectMemory: vi.fn().mockResolvedValue({ id: "updated-id" }),
    archiveProjectMemory: vi.fn().mockResolvedValue({ id: "archived-id" }),
}));

const {
    createProjectMemory,
    getProjectMemories,
    updateProjectMemory,
    archiveProjectMemory,
} = await import("@/lib/server/memory/project-memory");

const mockCreate = vi.mocked(createProjectMemory);
const mockGet = vi.mocked(getProjectMemories);
const mockUpdate = vi.mocked(updateProjectMemory);
const mockArchive = vi.mocked(archiveProjectMemory);

function makeProtocol(overrides?: Partial<ProtocolData>): ProtocolData {
    return {
        researchQuestion: "",
        pico: {
            population: "Adults with hypertension",
            intervention: "ACE inhibitors",
            comparison: "Placebo",
            outcome: "Blood pressure reduction",
        },
        eligibility: {
            inclusion: ["RCTs only", "Published 2010-2024"],
            exclusion: ["Animal studies", "Case reports"],
        },
        searchStrategy: { query: "", databases: [] },
        methodology: { studyDesigns: [], timeFrameStart: "", timeFrameEnd: "", qualityAssessmentTool: "", qualityAssessmentNotes: "" },
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue([]);
});

describe("syncProtocolToMemory", () => {
    it("syncs all 4 PICO fields as definition memories with correct categories", async () => {
        const result = await syncProtocolToMemory("proj-1", makeProtocol());

        expect(result.created).toBe(8); // 4 PICO + 2 inclusion + 2 exclusion
        expect(mockCreate).toHaveBeenCalledTimes(8);

        // Check PICO calls
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            projectId: "proj-1",
            type: "definition",
            category: "population",
            statement: "Adults with hypertension",
            importance: "critical",
            tags: ["protocol-sync:pico-population"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            category: "intervention",
            statement: "ACE inhibitors",
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            category: "comparison",
            statement: "Placebo",
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            category: "outcome",
            statement: "Blood pressure reduction",
        }));
    });

    it("syncs inclusion criteria as criterion memories", async () => {
        await syncProtocolToMemory("proj-1", makeProtocol());

        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "criterion",
            category: "inclusion",
            statement: "RCTs only",
            tags: ["protocol-sync:inclusion-0"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "criterion",
            category: "inclusion",
            statement: "Published 2010-2024",
            tags: ["protocol-sync:inclusion-1"],
        }));
    });

    it("syncs exclusion criteria as criterion memories", async () => {
        await syncProtocolToMemory("proj-1", makeProtocol());

        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "criterion",
            category: "exclusion",
            statement: "Animal studies",
            tags: ["protocol-sync:exclusion-0"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "criterion",
            category: "exclusion",
            statement: "Case reports",
            tags: ["protocol-sync:exclusion-1"],
        }));
    });

    it("syncs research question, search strategy, and methodology fields when present", async () => {
        const protocol = makeProtocol({
            researchQuestion: "Do ACE inhibitors reduce blood pressure in adults with hypertension?",
            searchStrategy: {
                query: "(hypertension) AND (ACE inhibitor)",
                databases: ["PubMed", "Embase"],
            },
            methodology: {
                studyDesigns: ["Randomized Controlled Trials (RCTs)", "Prospective Cohort Studies"],
                timeFrameStart: "2010",
                timeFrameEnd: "2024",
                qualityAssessmentTool: "GRADE",
                qualityAssessmentNotes: "Assess risk of bias independently by two reviewers",
            },
        });

        const result = await syncProtocolToMemory("proj-1", protocol);

        expect(result.created).toBe(18); // 4 PICO + 2 inclusion + 2 exclusion + 10 additional fields
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "goal",
            statement: "Do ACE inhibitors reduce blood pressure in adults with hypertension?",
            tags: ["protocol-sync:research-question"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            statement: "Search query: (hypertension) AND (ACE inhibitor)",
            tags: ["protocol-sync:search-query"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            statement: "Database: PubMed",
            tags: ["protocol-sync:database-0"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            statement: "Database: Embase",
            tags: ["protocol-sync:database-1"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            statement: "Study design: Randomized Controlled Trials (RCTs)",
            tags: ["protocol-sync:study-design-0"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            statement: "Time frame start: 2010",
            tags: ["protocol-sync:timeframe-start"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            statement: "Time frame end: 2024",
            tags: ["protocol-sync:timeframe-end"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            statement: "Quality assessment tool: GRADE",
            tags: ["protocol-sync:quality-tool"],
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            statement: "Quality assessment notes: Assess risk of bias independently by two reviewers",
            tags: ["protocol-sync:quality-notes"],
        }));
    });

    it("skips empty PICO fields", async () => {
        const protocol = makeProtocol({
            pico: { population: "Adults", intervention: "", comparison: "", outcome: "Mortality" },
        });

        const result = await syncProtocolToMemory("proj-1", protocol);

        // 2 PICO (population + outcome) + 2 inclusion + 2 exclusion = 6
        expect(result.created).toBe(6);
        expect(mockCreate).toHaveBeenCalledTimes(6);
    });

    it("revises memory when PICO field text changes", async () => {
        mockGet.mockResolvedValue([
            {
                id: "mem-pop",
                statement: "Old population text",
                tags: ["protocol-sync:pico-population"],
                type: "definition",
                category: "population",
                status: "active",
            },
        ] as any);

        const protocol = makeProtocol({
            pico: { population: "New population text", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: [], exclusion: [] },
        });

        const result = await syncProtocolToMemory("proj-1", protocol);

        expect(result.revised).toBe(1);
        expect(mockUpdate).toHaveBeenCalledWith("mem-pop", { statement: "New population text" });
    });

    it("archives memory when a criterion is removed from protocol", async () => {
        mockGet.mockResolvedValue([
            {
                id: "mem-inc-0",
                statement: "RCTs only",
                tags: ["protocol-sync:inclusion-0"],
                type: "criterion",
                status: "active",
            },
            {
                id: "mem-inc-1",
                statement: "Published 2010-2024",
                tags: ["protocol-sync:inclusion-1"],
                type: "criterion",
                status: "active",
            },
        ] as any);

        // Only keep first inclusion criterion, remove second
        const protocol = makeProtocol({
            pico: { population: "", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: ["RCTs only"], exclusion: [] },
        });

        const result = await syncProtocolToMemory("proj-1", protocol);

        expect(result.archived).toBe(1);
        expect(mockArchive).toHaveBeenCalledWith("mem-inc-1");
    });

    it("is idempotent: second call with same data creates nothing", async () => {
        mockGet.mockResolvedValue([
            { id: "m1", statement: "Adults", tags: ["protocol-sync:pico-population"], type: "definition", status: "active" },
        ] as any);

        const protocol = makeProtocol({
            pico: { population: "Adults", intervention: "", comparison: "", outcome: "" },
            eligibility: { inclusion: [], exclusion: [] },
        });

        const result = await syncProtocolToMemory("proj-1", protocol);

        expect(result.created).toBe(0);
        expect(result.revised).toBe(0);
        expect(result.archived).toBe(0);
    });

    it("all created memories have importance: critical and protocol-sync tag", async () => {
        await syncProtocolToMemory("proj-1", makeProtocol());

        for (const call of mockCreate.mock.calls) {
            const input = call[0];
            expect(input.importance).toBe("critical");
            expect(input.tags).toBeDefined();
            expect(input.tags![0]).toMatch(/^protocol-sync:/);
            expect(input.context).toBe("Auto-synced from protocol");
        }
    });
});
