import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProject, listProjects } from "@/lib/server/projects";
import { createDefaultProtocolData } from "@/types/protocol";

const LOCAL_SCOPE = { ownerId: "local-user", workspaceId: "local-workspace" } as const;

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    project: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockCreateProject = vi.mocked(prisma.project.create);
const mockListProjects = vi.mocked(prisma.project.findMany);

describe("projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a default protocol row via nested create", async () => {
    const createdAt = new Date("2026-02-25T10:00:00.000Z");
    mockCreateProject.mockResolvedValueOnce({
      id: "proj-1",
      demoKey: null,
      name: "Test project",
      description: null,
      status: "ready",
      statusText: "Status: Review Ready",
      papers: 0,
      progress: null,
      created: createdAt,
      modified: createdAt,
    } as never);

    await createProject(LOCAL_SCOPE, {
      id: "proj-1",
      name: "Test project",
      description: "",
      status: "ready",
      statusText: "Status: Review Ready",
      papers: 0,
      created: createdAt.toISOString(),
      modified: createdAt.toISOString(),
    });

    expect(mockCreateProject).toHaveBeenCalledTimes(1);
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          protocol: {
            create: {
              data: createDefaultProtocolData(),
            },
          },
        }),
      }),
    );
  });

  it("narrows the workspace index query to lightweight fields", async () => {
    const createdAt = new Date("2026-03-01T10:00:00.000Z");
    mockListProjects.mockResolvedValueOnce([
      {
        id: "proj-1",
        demoKey: null,
        name: "Alpha Review",
        description: null,
        status: "ready",
        statusText: "Status: Review Ready",
        papers: 3,
        progress: null,
        created: createdAt,
        modified: createdAt,
      },
    ] as never);

    const projects = await listProjects(LOCAL_SCOPE);

    expect(mockListProjects).toHaveBeenCalledWith({
      where: { workspaceId: LOCAL_SCOPE.workspaceId, ownerId: LOCAL_SCOPE.ownerId },
      select: {
        id: true,
        demoKey: true,
        name: true,
        description: true,
        status: true,
        statusText: true,
        papers: true,
        progress: true,
        created: true,
        modified: true,
      },
      orderBy: { modified: "desc" },
    });
    expect(projects).toEqual([
      {
        id: "proj-1",
        demoKey: null,
        name: "Alpha Review",
        description: undefined,
        status: "ready",
        statusText: "Status: Review Ready",
        papers: 3,
        progress: undefined,
        created: createdAt.toISOString(),
        modified: createdAt.toISOString(),
      },
    ]);
  });
});
