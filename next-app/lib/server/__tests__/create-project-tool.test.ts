import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectTool } from "@/lib/server/ai/tools/create-project";

const mockCreateProject = vi.fn();

vi.mock("@/lib/server/projects", () => ({
    createProject: (...args: unknown[]) => mockCreateProject(...args),
}));

vi.mock("@/lib/server/scope", () => ({
    SINGLE_USER_SCOPE: { ownerId: "local-user", workspaceId: "local-workspace" },
}));

describe("createProjectTool", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("requires explicit approval before creating a project", async () => {
        const result = await createProjectTool.execute({ name: "Diabetes Review" });
        expect(result.error).toBeUndefined();
        expect(result.result).toEqual({
            requiresApproval: true,
            proposedName: "Diabetes Review",
            message: 'Project creation for "Diabetes Review" requires explicit user approval. Ask for confirmation, then call create_project again with approved=true.',
        });
        expect(mockCreateProject).not.toHaveBeenCalled();
    });

    it("creates project with name and description", async () => {
        mockCreateProject.mockResolvedValue({ id: "new-123", name: "Diabetes Review" });
        const result = await createProjectTool.execute({
            name: "Diabetes Review",
            description: "Systematic review of diabetes treatments",
            approved: true,
        });
        expect(result.error).toBeUndefined();
        expect(result.result).toEqual({
            projectId: "new-123",
            projectName: "Diabetes Review",
            navigate: "/project/new-123",
        });
        expect(mockCreateProject).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                name: "Diabetes Review",
                description: "Systematic review of diabetes treatments",
                status: "harvesting",
                statusText: "Getting started",
            })
        );
    });

    it("creates project with name only", async () => {
        mockCreateProject.mockResolvedValue({ id: "new-456", name: "Quick Review" });
        const result = await createProjectTool.execute({ name: "Quick Review", approved: true });
        expect(result.error).toBeUndefined();
        expect((result.result as { projectId: string }).projectId).toBe("new-456");
    });

    it("returns error for empty name", async () => {
        const result = await createProjectTool.execute({ name: "" });
        expect(result.error).toContain("required");
    });

    it("returns error for overly long name", async () => {
        const result = await createProjectTool.execute({ name: "x".repeat(201) });
        expect(result.error).toContain("200 characters");
    });

    it("returns navigate URL", async () => {
        mockCreateProject.mockResolvedValue({ id: "p-abc", name: "Test" });
        const result = await createProjectTool.execute({ name: "Test", approved: true });
        expect((result.result as { navigate: string }).navigate).toBe("/project/p-abc");
    });

    it("has autonomy hardCap of 2", () => {
        expect(createProjectTool.autonomy?.hardCap).toBe(2);
        expect(createProjectTool.autonomy?.defaultLevel).toBe(2);
    });
});
