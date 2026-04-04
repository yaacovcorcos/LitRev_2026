import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  assertProjectAccess: vi.fn(),
  fetchFileAssetResponse: vi.fn(),
  logServerError: vi.fn(),
  prisma: {
    fileAsset: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/auth/session", () => ({
  requireApiSession: mocks.requireApiSession,
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: mocks.assertProjectAccess,
}));

vi.mock("@/lib/server/file-storage", () => ({
  fetchFileAssetResponse: mocks.fetchFileAssetResponse,
}));

vi.mock("@/lib/server/logging", () => ({
  logServerError: mocks.logServerError,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: mocks.prisma,
}));

const { GET } = await import("../route");

describe("GET /api/projects/[projectId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        workspaceId: "workspace-1",
        role: "member",
      },
    });
    mocks.assertProjectAccess.mockResolvedValue({
      ownerId: "user-1",
      workspaceId: "workspace-1",
    });
    mocks.prisma.fileAsset.findFirst.mockResolvedValue({
      id: "file-1",
      projectId: "proj-1",
      studyId: "study-1",
      kind: "source",
      filename: "paper.pdf",
      mimeType: "application/pdf",
      storagePath: "study-assets/projects/proj-1/studies/study-1/paper.pdf",
      publicUrl: null,
    });
    mocks.fetchFileAssetResponse.mockResolvedValue(
      new Response("file-bytes", {
        headers: {
          "content-type": "application/pdf",
          "content-length": "10",
        },
      }),
    );
  });

  function buildRequest() {
    return new NextRequest("http://localhost/api/projects/proj-1/files/file-1");
  }

  it("passes through auth failures", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ projectId: "proj-1", fileId: "file-1" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when the caller does not have project access", async () => {
    mocks.assertProjectAccess.mockRejectedValue(new Error("Project not found or access denied."));

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ projectId: "proj-1", fileId: "file-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
    expect(mocks.prisma.fileAsset.findFirst).not.toHaveBeenCalled();
  });

  it("streams an authorized file with private cache headers", async () => {
    const response = await GET(buildRequest(), {
      params: Promise.resolve({ projectId: "proj-1", fileId: "file-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Content-Disposition")).toContain("paper.pdf");
    await expect(response.text()).resolves.toBe("file-bytes");
    expect(mocks.fetchFileAssetResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: "file-1" }),
      { projectId: "proj-1", studyId: "study-1" },
    );
  });

  it("returns 404 when the file row is missing", async () => {
    mocks.prisma.fileAsset.findFirst.mockResolvedValue(null);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ projectId: "proj-1", fileId: "file-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns 404 for invalid storage rows without leaking details", async () => {
    mocks.fetchFileAssetResponse.mockRejectedValue(new Error("Invalid file storage location."));

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ projectId: "proj-1", fileId: "file-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
