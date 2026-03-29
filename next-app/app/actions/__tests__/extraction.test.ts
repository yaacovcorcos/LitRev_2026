import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(),
  assertProjectAccess: vi.fn(),
  getFileAssetById: vi.fn(),
  enqueueStudyProcessingJob: vi.fn(),
  kickStudyProcessingDispatcher: vi.fn(),
  listStudyProcessingStateItems: vi.fn(),
  prioritizeStudyProcessingJob: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  withAuth: (handler: (session: { userId: string; workspaceId: string }) => Promise<unknown>) =>
    mocks.withAuth(handler),
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: (...args: unknown[]) => mocks.assertProjectAccess(...args),
}));

vi.mock("@/lib/server/files", () => ({
  getFileAssetById: (...args: unknown[]) => mocks.getFileAssetById(...args),
}));

vi.mock("@/lib/server/study-processing", () => ({
  enqueueStudyProcessingJob: (...args: unknown[]) => mocks.enqueueStudyProcessingJob(...args),
  kickStudyProcessingDispatcher: (...args: unknown[]) => mocks.kickStudyProcessingDispatcher(...args),
  listStudyProcessingStateItems: (...args: unknown[]) => mocks.listStudyProcessingStateItems(...args),
  prioritizeStudyProcessingJob: (...args: unknown[]) => mocks.prioritizeStudyProcessingJob(...args),
}));

vi.mock("@/lib/server/logging", () => ({
  logServerError: (...args: unknown[]) => mocks.logServerError(...args),
}));

import {
  extractStudyFromPdfAction,
  listStudyProcessingStatesAction,
  prioritizeStudyProcessingAction,
} from "@/app/actions/extraction";

describe("extraction actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withAuth.mockImplementation((handler: (session: { userId: string; workspaceId: string }) => Promise<unknown>) =>
      handler({ userId: "user-1", workspaceId: "ws-1" }),
    );
    mocks.assertProjectAccess.mockResolvedValue({ ownerId: "user-1", workspaceId: "ws-1" });
    mocks.kickStudyProcessingDispatcher.mockReturnValue(true);
  });

  it("queues manual extraction and returns durable processing truth", async () => {
    mocks.getFileAssetById.mockResolvedValue({
      id: "file-1",
      studyId: "study-1",
      mimeType: "application/pdf",
      format: "pdf",
    });
    mocks.enqueueStudyProcessingJob.mockResolvedValue({
      study: {
        id: "study-1",
        title: "Study",
        authors: "Doe",
        year: 2024,
        status: "pending",
        quality: "-",
        processing: {
          byPhase: {
            quickExtract: { phase: "quick_extract", state: "queued", attemptCount: 0 },
            deepAnalysis: { phase: "deep_analysis", state: "idle", attemptCount: 0 },
          },
          currentPhase: "quick_extract",
          currentState: "queued",
          nextAction: "wait",
          prerequisitesSatisfied: { deepAnalysis: false },
        },
      },
      processing: {
        byPhase: {
          quickExtract: { phase: "quick_extract", state: "queued", attemptCount: 0 },
          deepAnalysis: { phase: "deep_analysis", state: "idle", attemptCount: 0 },
        },
        currentPhase: "quick_extract",
        currentState: "queued",
        nextAction: "wait",
        prerequisitesSatisfied: { deepAnalysis: false },
      },
      transitionHint: "accepted",
    });

    const result = await extractStudyFromPdfAction("project-1", "study-1", "file-1");

    expect(result).toEqual({
      success: true,
      study: expect.objectContaining({ id: "study-1" }),
      processing: expect.objectContaining({ currentState: "queued" }),
      transitionHint: "accepted",
    });
  });

  it("lists processing states for requested studies", async () => {
    mocks.listStudyProcessingStateItems.mockResolvedValue([
      {
        studyId: "study-1",
        processing: {
          byPhase: {
            quickExtract: { phase: "quick_extract", state: "running", attemptCount: 0 },
            deepAnalysis: { phase: "deep_analysis", state: "idle", attemptCount: 0 },
          },
          currentPhase: "quick_extract",
          currentState: "running",
          nextAction: "wait",
          prerequisitesSatisfied: { deepAnalysis: false },
        },
        study: {
          id: "study-1",
          title: "Study",
          authors: "Doe",
          year: 2024,
          status: "pending",
          quality: "-",
        },
      },
    ]);

    const result = await listStudyProcessingStatesAction("project-1", ["study-1"]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]?.processing.currentState).toBe("running");
    }
    expect(mocks.kickStudyProcessingDispatcher).toHaveBeenCalledTimes(1);
  });

  it("prioritizes an active background job", async () => {
    mocks.prioritizeStudyProcessingJob.mockResolvedValue({
      study: {
        id: "study-1",
        title: "Study",
        authors: "Doe",
        year: 2024,
        status: "pending",
        quality: "-",
      },
      processing: {
        byPhase: {
          quickExtract: { phase: "quick_extract", state: "running", priority: "foreground", attemptCount: 0 },
          deepAnalysis: { phase: "deep_analysis", state: "idle", attemptCount: 0 },
        },
        currentPhase: "quick_extract",
        currentState: "running",
        nextAction: "wait",
        prerequisitesSatisfied: { deepAnalysis: false },
      },
      transitionHint: "upgraded",
    });

    const result = await prioritizeStudyProcessingAction("project-1", "study-1", "quick_extract");

    expect(result.success).toBe(true);
    expect(result.transitionHint).toBe("upgraded");
  });
});
