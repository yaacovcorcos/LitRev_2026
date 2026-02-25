import { beforeEach, describe, expect, it, vi } from "vitest";
import { listProjectsTool } from "@/lib/server/ai/tools/list-projects";

const mockListProjects = vi.fn();
const mockStudyCount = vi.fn();

vi.mock("@/lib/server/projects", () => ({
    listProjects: (...args: unknown[]) => mockListProjects(...args),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        study: {
            count: (...args: unknown[]) => mockStudyCount(...args),
        },
    },
}));

function makeProject(id: string, name: string, status = "harvesting") {
    return { id, name, status, modified: "2025-01-01T00:00:00.000Z" };
}

describe("listProjectsTool", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStudyCount.mockResolvedValue(0);
    });

    it("returns empty array when no projects", async () => {
        mockListProjects.mockResolvedValue([]);
        const result = await listProjectsTool.execute({});
        expect(result.error).toBeUndefined();
        expect(result.result).toEqual({ projects: [], total: 0 });
    });

    it("returns projects with study counts", async () => {
        mockListProjects.mockResolvedValue([
            makeProject("p1", "Diabetes Review"),
            makeProject("p2", "Cardiology Review"),
        ]);
        mockStudyCount.mockResolvedValueOnce(5).mockResolvedValueOnce(12);

        const result = await listProjectsTool.execute({});
        expect(result.error).toBeUndefined();
        const data = result.result as { projects: Array<{ id: string; studyCount: number }>; total: number };
        expect(data.total).toBe(2);
        expect(data.projects).toHaveLength(2);
        expect(data.projects[0]).toEqual({
            id: "p1",
            name: "Diabetes Review",
            status: "harvesting",
            studyCount: 5,
            updatedAt: "2025-01-01T00:00:00.000Z",
        });
    });

    it("filters by query string (case-insensitive)", async () => {
        mockListProjects.mockResolvedValue([
            makeProject("p1", "Diabetes Review"),
            makeProject("p2", "Cardiology Review"),
            makeProject("p3", "Diabetes Meta-analysis"),
        ]);

        const result = await listProjectsTool.execute({ query: "diabetes" });
        const data = result.result as { projects: Array<{ id: string }>; total: number };
        expect(data.total).toBe(2);
        expect(data.projects.map((p) => p.id)).toEqual(["p1", "p3"]);
    });

    it("caps at 50 results", async () => {
        const projects = Array.from({ length: 60 }, (_, i) => makeProject(`p${i}`, `Project ${i}`));
        mockListProjects.mockResolvedValue(projects);

        const result = await listProjectsTool.execute({});
        const data = result.result as { projects: unknown[]; total: number };
        expect(data.total).toBe(60);
        expect(data.projects).toHaveLength(50);
    });
});
