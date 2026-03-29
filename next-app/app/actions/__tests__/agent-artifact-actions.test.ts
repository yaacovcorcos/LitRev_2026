import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reviewArtifact: vi.fn(),
  getArtifact: vi.fn(),
  undoArtifact: vi.fn(),
  getRunTimeline: vi.fn(),
  getRunLineage: vi.fn(),
  getAutonomyConfig: vi.fn(),
  updateAutonomyConfig: vi.fn(),
  revalidatePath: vi.fn(),
  withAuth: vi.fn(),
  artifactFindFirst: vi.fn(),
  runFindFirst: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/server/agent/artifacts", () => ({
  reviewArtifact: mocks.reviewArtifact,
  undoArtifact: mocks.undoArtifact,
  getArtifact: mocks.getArtifact,
}));

vi.mock("@/lib/server/agent/events", () => ({
  getRunTimeline: mocks.getRunTimeline,
}));

vi.mock("@/lib/server/agent/run", () => ({
  getRunLineage: mocks.getRunLineage,
}));

vi.mock("@/lib/server/agent/autonomy", () => ({
  getAutonomyConfig: mocks.getAutonomyConfig,
  updateAutonomyConfig: mocks.updateAutonomyConfig,
}));

vi.mock("@/lib/server/auth/session", () => ({
  withAuth: mocks.withAuth,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    artifact: {
      findFirst: mocks.artifactFindFirst,
    },
    agentRun: {
      findFirst: mocks.runFindFirst,
    },
  },
}));

const { reviewArtifactAction } = await import("../agent");
const { ArtifactError } = await import("@/lib/server/agent/artifact-errors");

describe("reviewArtifactAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.artifactFindFirst.mockResolvedValue({ id: "artifact-1" });
    mocks.withAuth.mockImplementation(async (callback: (ctx: { userId: string; workspaceId: string }) => Promise<unknown>) =>
      callback({ userId: "user-1", workspaceId: "workspace-1" })
    );
  });

  it("passes the acting user into manual review", async () => {
    mocks.reviewArtifact.mockResolvedValue({
      id: "artifact-1",
      type: "draft_diff",
      status: "accepted",
      projectId: "proj-1",
      payload: { section: "Introduction" },
    });

    const result = await reviewArtifactAction("artifact-1", "accepted");

    expect(result.success).toBe(true);
    expect(mocks.reviewArtifact).toHaveBeenCalledWith(
      "artifact-1",
      "accepted",
      undefined,
      undefined,
      { actorUserId: "user-1" },
    );
  });

  it("returns typed safe errors for artifact-engine failures", async () => {
    mocks.reviewArtifact.mockRejectedValue(
      new ArtifactError("ARTIFACT_CONTEXT_MISSING", "Service scope requires ownerId and workspaceId."),
    );

    const result = await reviewArtifactAction("artifact-1", "accepted");

    expect(result).toEqual({
      success: false,
      error: "The artifact could not be applied because required context is missing.",
      errorCode: "ARTIFACT_CONTEXT_MISSING",
    });
  });
});
