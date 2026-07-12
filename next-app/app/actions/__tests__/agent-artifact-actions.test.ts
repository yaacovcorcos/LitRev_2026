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
  assertProjectAccess: vi.fn(),
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

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: mocks.assertProjectAccess,
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

const {
    getAutonomyConfigAction,
    reviewArtifactAction,
    undoArtifactAction,
    updateAutonomyAction,
} = await import("../agent");
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

  it("revalidates the ledger after accepting a study deletion", async () => {
    mocks.reviewArtifact.mockResolvedValue({
      id: "artifact-1",
      type: "study_deletion",
      status: "accepted",
      projectId: "proj-1",
      payload: { studyId: "study-1", title: "Study One" },
    });

    const result = await reviewArtifactAction("artifact-1", "accepted");

    expect(result.success).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/project/proj-1/ledger/study-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/project/proj-1/ledger");
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

  it("returns typed safe apply failures without leaking raw runtime messages", async () => {
    mocks.reviewArtifact.mockRejectedValue(
      new ArtifactError("ARTIFACT_APPLY_FAILED", "database connection dropped"),
    );

    const result = await reviewArtifactAction("artifact-1", "accepted");

    expect(result).toEqual({
      success: false,
      error: "The proposed change could not be applied.",
      errorCode: "ARTIFACT_APPLY_FAILED",
    });
  });
});

describe("undoArtifactAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.artifactFindFirst.mockResolvedValue({ id: "artifact-1" });
    mocks.withAuth.mockImplementation(async (callback: (ctx: { userId: string; workspaceId: string }) => Promise<unknown>) =>
      callback({ userId: "user-1", workspaceId: "workspace-1" })
    );
  });

  it("returns a typed safe denial for artifact types without restore support", async () => {
    mocks.undoArtifact.mockRejectedValue(
      new ArtifactError("ARTIFACT_UNDO_UNSUPPORTED", "memory_proposal has no restore handler"),
    );

    const result = await undoArtifactAction("artifact-1");

    expect(result).toEqual({
      success: false,
      error: "This artifact type cannot be undone.",
      errorCode: "ARTIFACT_UNDO_UNSUPPORTED",
    });
  });

  it("revalidates the ledger after restoring a study deletion", async () => {
    mocks.undoArtifact.mockResolvedValue({
      id: "artifact-1",
      type: "study_deletion",
      status: "rejected",
      projectId: "proj-1",
      payload: { studyId: "study-1", title: "Study One" },
    });

    const result = await undoArtifactAction("artifact-1");

    expect(result.success).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/project/proj-1/ledger/study-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/project/proj-1/ledger");
  });
});

describe("autonomy config action access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withAuth.mockImplementation(async (callback: (ctx: { userId: string; workspaceId: string }) => Promise<unknown>) =>
      callback({ userId: "user-1", workspaceId: "workspace-1" })
    );
    mocks.assertProjectAccess.mockResolvedValue({
      ownerId: "user-1",
      workspaceId: "workspace-1",
    });
    mocks.getAutonomyConfig.mockResolvedValue({ preset: "assisted", toolOverrides: {} });
    mocks.updateAutonomyConfig.mockResolvedValue({ preset: "assisted", toolOverrides: {} });
  });

  it("denies reading project autonomy when the project is outside the actor scope", async () => {
    mocks.assertProjectAccess.mockRejectedValueOnce(new Error("Project not found or access denied."));

    const result = await getAutonomyConfigAction("project-foreign");

    expect(result).toEqual({
      success: false,
      error: "The requested resource was not found.",
    });
    expect(mocks.assertProjectAccess).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "project-foreign",
    );
    expect(mocks.getAutonomyConfig).not.toHaveBeenCalled();
  });

  it("denies updating project autonomy when the project is outside the actor scope", async () => {
    mocks.assertProjectAccess.mockRejectedValueOnce(new Error("Project not found or access denied."));

    const result = await updateAutonomyAction("assisted", undefined, "project-foreign");

    expect(result).toEqual({
      success: false,
      error: "The requested resource was not found.",
    });
    expect(mocks.updateAutonomyConfig).not.toHaveBeenCalled();
  });

  it("preserves owned project updates after authorization", async () => {
    const result = await updateAutonomyAction(
      "assisted",
      { search_pubmed: 2 },
      "project-1",
    );

    expect(result.success).toBe(true);
    expect(mocks.assertProjectAccess).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "project-1",
    );
    expect(mocks.updateAutonomyConfig).toHaveBeenCalledWith(
      "user-1",
      "assisted",
      { search_pubmed: 2 },
      "project-1",
    );
  });

  it("preserves user-default autonomy access without a project lookup", async () => {
    const result = await getAutonomyConfigAction();

    expect(result.success).toBe(true);
    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
    expect(mocks.getAutonomyConfig).toHaveBeenCalledWith("user-1", undefined);
  });
});
