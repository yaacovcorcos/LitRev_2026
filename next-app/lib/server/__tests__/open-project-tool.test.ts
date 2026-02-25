import { beforeEach, describe, expect, it, vi } from "vitest";
import { openProjectTool } from "@/lib/server/ai/tools/open-project";

const mockGetProject = vi.fn();
const mockListProjects = vi.fn();

vi.mock("@/lib/server/projects", () => ({
    getProject: (...args: unknown[]) => mockGetProject(...args),
    listProjects: (...args: unknown[]) => mockListProjects(...args),
}));

function makeProject(id: string, name: string) {
    return { id, name, status: "harvesting", modified: "2025-01-01T00:00:00.000Z" };
}

describe("openProjectTool", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("navigates by exact projectId", async () => {
        mockGetProject.mockResolvedValue(makeProject("p1", "Diabetes"));
        const result = await openProjectTool.execute({ projectId: "p1" });
        expect(result.error).toBeUndefined();
        expect(result.result).toEqual({
            projectId: "p1",
            projectName: "Diabetes",
            navigate: "/project/p1",
        });
    });

    it("appends page suffix correctly", async () => {
        mockGetProject.mockResolvedValue(makeProject("p1", "Diabetes"));
        const result = await openProjectTool.execute({ projectId: "p1", page: "protocol" });
        expect((result.result as { navigate: string }).navigate).toBe("/project/p1/protocol");
    });

    it("maps overview page to the base project URL", async () => {
        mockGetProject.mockResolvedValue(makeProject("p1", "Diabetes"));
        const result = await openProjectTool.execute({ projectId: "p1", page: "overview" });
        expect((result.result as { navigate: string }).navigate).toBe("/project/p1");
    });

    it("returns error for unknown projectId", async () => {
        mockGetProject.mockResolvedValue(null);
        const result = await openProjectTool.execute({ projectId: "p-nonexistent" });
        expect(result.error).toContain("Project not found");
    });

    it("navigates by exact name match", async () => {
        mockListProjects.mockResolvedValue([
            makeProject("p1", "Diabetes Review"),
            makeProject("p2", "Cardiology Review"),
        ]);
        const result = await openProjectTool.execute({ name: "Diabetes Review" });
        expect(result.error).toBeUndefined();
        expect(result.result).toEqual({
            projectId: "p1",
            projectName: "Diabetes Review",
            navigate: "/project/p1",
        });
    });

    it("navigates on single substring match", async () => {
        mockListProjects.mockResolvedValue([
            makeProject("p1", "Diabetes Review"),
            makeProject("p2", "Cardiology Review"),
        ]);
        const result = await openProjectTool.execute({ name: "cardio" });
        expect(result.error).toBeUndefined();
        expect((result.result as { projectId: string }).projectId).toBe("p2");
    });

    it("returns candidates on ambiguous name", async () => {
        mockListProjects.mockResolvedValue([
            makeProject("p1", "Review of Diabetes"),
            makeProject("p2", "Review of Cardiology"),
            makeProject("p3", "Review of Oncology"),
        ]);
        const result = await openProjectTool.execute({ name: "Review" });
        expect(result.error).toBeUndefined();
        const data = result.result as { candidates: Array<{ id: string; name: string }> };
        expect(data.candidates).toHaveLength(3);
        expect(data.candidates![0]!.id).toBe("p1");
    });

    it("returns error for no match", async () => {
        mockListProjects.mockResolvedValue([makeProject("p1", "Diabetes Review")]);
        const result = await openProjectTool.execute({ name: "nonexistent" });
        expect(result.error).toContain("No project found");
    });

    it("requires projectId or name", async () => {
        const result = await openProjectTool.execute({});
        expect(result.error).toContain("Provide projectId or name");
    });
});
