import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProject } from "@/lib/server/projects";
import { createDefaultProtocolData } from "@/types/protocol";

const LOCAL_SCOPE = { ownerId: "local-user", workspaceId: "local-workspace" } as const;

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    project: {
      create: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockCreateProject = vi.mocked(prisma.project.create);

describe("createProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a default protocol row via nested create", async () => {
    const createdAt = new Date("2026-02-25T10:00:00.000Z");
    mockCreateProject.mockResolvedValueOnce({
      id: "proj-1",
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
});
