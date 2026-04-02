import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertProjectAccess: vi.fn(),
  fileAssetCreate: vi.fn(),
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: (...args: unknown[]) => mocks.assertProjectAccess(...args),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    fileAsset: {
      create: (...args: unknown[]) => mocks.fileAssetCreate(...args),
    },
  },
}));

import { createFileAsset } from "@/lib/server/files";

describe("createFileAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertProjectAccess.mockResolvedValue({ workspaceId: "ws-1" });
    mocks.fileAssetCreate.mockResolvedValue({
      id: "file-1",
      projectId: "project-1",
      studyId: "study-1",
      kind: "source",
      format: "pdf",
      filename: "study.pdf",
      mimeType: "application/pdf",
      size: 123,
      storagePath: "study-assets/projects/project-1/studies/study-1/file.pdf",
      publicUrl: "https://example.test/file.pdf",
      version: 1,
      metadata: { source: "test" },
      createdAt: new Date("2026-04-02T00:00:00Z"),
      updatedAt: new Date("2026-04-02T00:00:00Z"),
    });
  });

  it("accepts canonical project-scoped storage paths", async () => {
    const result = await createFileAsset(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1",
      {
        studyId: "study-1",
        kind: "source",
        format: "pdf",
        filename: "study.pdf",
        mimeType: "application/pdf",
        size: 123,
        storagePath: "study-assets/projects/project-1/studies/study-1/file.pdf",
        metadata: { source: "test" },
      },
    );

    expect(mocks.assertProjectAccess).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1",
    );
    expect(mocks.fileAssetCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "project-1",
        workspaceId: "ws-1",
        storagePath: "study-assets/projects/project-1/studies/study-1/file.pdf",
      }),
    });
    expect(result.projectId).toBe("project-1");
  });

  it("accepts project-scoped object paths without the bucket prefix", async () => {
    await createFileAsset(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1",
      {
        kind: "attachment",
        filename: "paper.pdf",
        mimeType: "application/pdf",
        size: 321,
        storagePath: "projects/project-1/conversations/file.pdf",
      },
    );

    expect(mocks.fileAssetCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storagePath: "projects/project-1/conversations/file.pdf",
      }),
    });
  });

  it("rejects paths that only contain the project id as a substring", async () => {
    await expect(
      createFileAsset(
        { ownerId: "user-1", workspaceId: "ws-1" },
        "project-1",
        {
          kind: "source",
          filename: "study.pdf",
          mimeType: "application/pdf",
          size: 123,
          storagePath: "study-assets/projects/project-12/studies/project-1/file.pdf",
        },
      ),
    ).rejects.toThrow("Storage path must belong to the specified project.");

    expect(mocks.fileAssetCreate).not.toHaveBeenCalled();
  });

  it("rejects non-project storage prefixes", async () => {
    await expect(
      createFileAsset(
        { ownerId: "user-1", workspaceId: "ws-1" },
        "project-1",
        {
          kind: "source",
          filename: "study.pdf",
          mimeType: "application/pdf",
          size: 123,
          storagePath: "study-assets/external/project-1/file.pdf",
        },
      ),
    ).rejects.toThrow("Storage path must belong to the specified project.");

    expect(mocks.fileAssetCreate).not.toHaveBeenCalled();
  });
});
