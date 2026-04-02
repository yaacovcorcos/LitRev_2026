import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertProjectAccess: vi.fn(),
  studyFindFirst: vi.fn(),
  studyFindMany: vi.fn(),
  studyFindUnique: vi.fn(),
  studyUpdate: vi.fn(),
  fileFindFirst: vi.fn(),
  fileFindUnique: vi.fn(),
  jobFindUnique: vi.fn(),
  jobFindMany: vi.fn(),
  jobFindFirst: vi.fn(),
  jobCreate: vi.fn(),
  jobUpdate: vi.fn(),
  jobUpdateMany: vi.fn(),
  transaction: vi.fn(),
  extractStudyFromPdf: vi.fn(),
  deepAnalyzeStudyFromPdf: vi.fn(),
  createMemoriesFromDeepAnalysis: vi.fn(),
  logServerWarn: vi.fn(),
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: (...args: unknown[]) => mocks.assertProjectAccess(...args),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    study: {
      findFirst: (...args: unknown[]) => mocks.studyFindFirst(...args),
      findMany: (...args: unknown[]) => mocks.studyFindMany(...args),
      findUnique: (...args: unknown[]) => mocks.studyFindUnique(...args),
      update: (...args: unknown[]) => mocks.studyUpdate(...args),
    },
    fileAsset: {
      findFirst: (...args: unknown[]) => mocks.fileFindFirst(...args),
      findUnique: (...args: unknown[]) => mocks.fileFindUnique(...args),
    },
    studyProcessingJob: {
      findUnique: (...args: unknown[]) => mocks.jobFindUnique(...args),
      findMany: (...args: unknown[]) => mocks.jobFindMany(...args),
      findFirst: (...args: unknown[]) => mocks.jobFindFirst(...args),
      create: (...args: unknown[]) => mocks.jobCreate(...args),
      update: (...args: unknown[]) => mocks.jobUpdate(...args),
      updateMany: (...args: unknown[]) => mocks.jobUpdateMany(...args),
    },
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

vi.mock("@/lib/server/pdf-extraction", () => ({
  extractStudyFromPdf: (...args: unknown[]) => mocks.extractStudyFromPdf(...args),
  deepAnalyzeStudyFromPdf: (...args: unknown[]) => mocks.deepAnalyzeStudyFromPdf(...args),
}));

vi.mock("@/lib/server/memory/study-memory", () => ({
  createMemoriesFromDeepAnalysis: (...args: unknown[]) => mocks.createMemoriesFromDeepAnalysis(...args),
}));

vi.mock("@/lib/server/logging", () => ({
  logServerError: vi.fn(),
  logServerWarn: (...args: unknown[]) => mocks.logServerWarn(...args),
}));

import {
  buildStudyProcessingSnapshotFromJobs,
  enqueueStudyProcessingJob,
  kickStudyProcessingDispatcher,
  processOneStudyProcessingJob,
} from "@/lib/server/study-processing";

describe("study-processing", () => {
  const previousInternalToken = process.env.STUDY_PROCESSING_INTERNAL_TOKEN;
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
  const previousPublicBetterAuthUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  const previousVercelUrl = process.env.VERCEL_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertProjectAccess.mockResolvedValue({ ownerId: "user-1", workspaceId: "ws-1" });
    type TransactionMock = {
      study: {
        update: typeof mocks.studyUpdate;
      };
      studyProcessingJob: {
        updateMany: typeof mocks.jobUpdateMany;
      };
    };
    mocks.transaction.mockImplementation(async (handler: (tx: TransactionMock) => Promise<unknown>) => {
      const tx: TransactionMock = {
        study: {
          update: mocks.studyUpdate,
        },
        studyProcessingJob: {
          updateMany: mocks.jobUpdateMany,
        },
      };
      return handler(tx);
    });
  });

  function mockSuccessfulQuickExtractJob() {
    const startedAt = new Date("2026-03-01T00:01:00Z");
    mocks.jobUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 1 });
    mocks.jobFindFirst.mockResolvedValue({
      id: "job-1",
      studyId: "study-1",
      projectId: "project-1",
      workspaceId: "ws-1",
      fileAssetId: "file-1",
      phase: "quick_extract",
      state: "queued",
      priority: "foreground",
      requestSource: "manual_extract",
      attemptCount: 0,
      requestedAt: new Date("2026-03-01T00:00:00Z"),
      startedAt: null,
      leaseExpiresAt: null,
      completedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date("2026-03-01T00:00:00Z"),
      updatedAt: new Date("2026-03-01T00:00:00Z"),
    });
    mocks.jobFindUnique.mockResolvedValue({
      id: "job-1",
      studyId: "study-1",
      projectId: "project-1",
      workspaceId: "ws-1",
      fileAssetId: "file-1",
      phase: "quick_extract",
      state: "running",
      priority: "foreground",
      requestSource: "manual_extract",
      attemptCount: 0,
      requestedAt: new Date("2026-03-01T00:00:00Z"),
      startedAt,
      leaseExpiresAt: new Date("2026-03-01T00:03:00Z"),
      completedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date("2026-03-01T00:00:00Z"),
      updatedAt: new Date("2026-03-01T00:01:00Z"),
    });
    mocks.studyFindUnique.mockResolvedValue({
      id: "study-1",
      title: "Study",
      authors: "Unknown",
      year: 2026,
      status: "pending",
      quality: "-",
      details: { source: "pdf-import" },
    });
    mocks.fileFindUnique.mockResolvedValue({
      id: "file-1",
      projectId: "project-1",
      studyId: "study-1",
      kind: "source",
      filename: "study.pdf",
      mimeType: "application/pdf",
      storagePath: "study-assets/projects/project-1/studies/study-1/study.pdf",
      publicUrl: "https://example.com/study.pdf",
    });
    mocks.extractStudyFromPdf.mockResolvedValue({
      success: true,
      title: "Extracted title",
      authors: "Doe",
      year: 2024,
      details: { abstract: "Abstract" },
      confidence: {},
      missingFields: [],
    });
    mocks.studyUpdate.mockResolvedValue({});
  }

  afterEach(() => {
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = previousInternalToken;
    process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = previousPublicBetterAuthUrl;
    process.env.VERCEL_URL = previousVercelUrl;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("treats already extracted legacy studies as ready for analysis without explicit quick-extract jobs", () => {
    const snapshot = buildStudyProcessingSnapshotFromJobs(
      {
        status: "extracted",
        details: {},
      } as { status: string; details: Prisma.JsonValue },
      [],
    );

    expect(snapshot.byPhase.quickExtract.state).toBe("succeeded");
    expect(snapshot.nextAction).toBe("analyze");
    expect(snapshot.prerequisitesSatisfied.deepAnalysis).toBe(true);
  });

  it("creates one queued quick-extract row and returns processing truth", async () => {
    mocks.studyFindFirst.mockResolvedValue({
      id: "study-1",
      projectId: "project-1",
      title: "Study",
      authors: "Unknown",
      year: 2026,
      status: "pending",
      quality: "-",
      details: { source: "pdf-import" },
      deletedAt: null,
      createdAt: new Date("2026-03-01T00:00:00Z"),
      updatedAt: new Date("2026-03-01T00:00:00Z"),
    });
    mocks.fileFindFirst.mockResolvedValue({
      id: "file-1",
      projectId: "project-1",
      studyId: "study-1",
      mimeType: "application/pdf",
      format: "pdf",
    });
    mocks.jobFindUnique.mockResolvedValue(null);
    mocks.jobCreate.mockResolvedValue({});
    mocks.studyFindMany.mockResolvedValue([
      {
        id: "study-1",
        projectId: "project-1",
        title: "Study",
        authors: "Unknown",
        year: 2026,
        status: "pending",
        quality: "-",
        details: { source: "pdf-import" },
        deletedAt: null,
        createdAt: new Date("2026-03-01T00:00:00Z"),
        updatedAt: new Date("2026-03-01T00:00:00Z"),
      },
    ]);
    mocks.jobFindMany.mockResolvedValue([
      {
        id: "job-1",
        studyId: "study-1",
        projectId: "project-1",
        workspaceId: "ws-1",
        fileAssetId: "file-1",
        phase: "quick_extract",
        state: "queued",
        priority: "foreground",
        requestSource: "manual_extract",
        attemptCount: 0,
        requestedAt: new Date("2026-03-01T00:00:00Z"),
        startedAt: null,
        leaseExpiresAt: null,
        completedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: new Date("2026-03-01T00:00:00Z"),
        updatedAt: new Date("2026-03-01T00:00:00Z"),
      },
    ]);

    const result = await enqueueStudyProcessingJob(
      { ownerId: "user-1", workspaceId: "ws-1" },
      {
        projectId: "project-1",
        studyId: "study-1",
        fileAssetId: "file-1",
        phase: "quick_extract",
        priority: "foreground",
        requestSource: "manual_extract",
      },
    );

    expect(mocks.jobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studyId: "study-1",
        phase: "quick_extract",
        state: "queued",
        priority: "foreground",
        requestSource: "manual_extract",
      }),
    });
    expect(result.transitionHint).toBe("accepted");
    expect(result.processing.byPhase.quickExtract.state).toBe("queued");
  });

  it("processes one claimed quick-extract job and marks it succeeded", async () => {
    mockSuccessfulQuickExtractJob();

    const result = await processOneStudyProcessingJob();

    expect(result).toEqual({
      processed: true,
      success: true,
      studyId: "study-1",
    });
    expect(mocks.studyUpdate).toHaveBeenCalledWith({
      where: { id: "study-1" },
      data: expect.objectContaining({
        title: "Extracted title",
        authors: "Doe",
        year: 2024,
        status: "extracted",
      }),
    });
  });

  it("falls back to direct local processing when the internal token is missing in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.STUDY_PROCESSING_INTERNAL_TOKEN;
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockSuccessfulQuickExtractJob();

    const result = await kickStudyProcessingDispatcher();

    expect(result).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(mocks.studyUpdate).toHaveBeenCalledTimes(1);
    });
    expect(mocks.logServerWarn).not.toHaveBeenCalled();
  });

  it("falls back to direct local processing when the trusted base URL is missing in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "internal-secret";
    delete process.env.BETTER_AUTH_URL;
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    delete process.env.VERCEL_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockSuccessfulQuickExtractJob();

    const result = await kickStudyProcessingDispatcher();

    expect(result).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(mocks.studyUpdate).toHaveBeenCalledTimes(1);
    });
    expect(mocks.logServerWarn).not.toHaveBeenCalled();
  });

  it("kicks the internal dispatcher with the trusted base URL only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "internal-secret";
    process.env.BETTER_AUTH_URL = "https://litrev.example.com";
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    delete process.env.VERCEL_URL;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await kickStudyProcessingDispatcher();

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://litrev.example.com/api/internal/study-processing",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer internal-secret",
        },
      }),
    );
  });

  it("prefers the trusted configured base URL order over untrusted fallback values", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "internal-secret";
    process.env.BETTER_AUTH_URL = "https://primary.example.com/app";
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = "https://public.example.com";
    process.env.VERCEL_URL = "preview.vercel.app";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await kickStudyProcessingDispatcher();

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://primary.example.com/api/internal/study-processing",
      expect.any(Object),
    );
  });

  it("returns false when the internal dispatcher rejects the request", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "internal-secret";
    process.env.BETTER_AUTH_URL = "https://litrev.example.com";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await kickStudyProcessingDispatcher();

    expect(result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns false when kicking the internal dispatcher throws", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "internal-secret";
    process.env.BETTER_AUTH_URL = "https://litrev.example.com";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await kickStudyProcessingDispatcher();

    expect(result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns false without side effects when test mode is active", async () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "internal-secret";
    process.env.BETTER_AUTH_URL = "https://litrev.example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await kickStudyProcessingDispatcher();

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.logServerWarn).not.toHaveBeenCalled();
  });

  it("returns false and logs a warning when deployed dispatcher config is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.STUDY_PROCESSING_INTERNAL_TOKEN;
    process.env.BETTER_AUTH_URL = "https://litrev.example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await kickStudyProcessingDispatcher();

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.logServerWarn).toHaveBeenCalledWith(
      "study-processing",
      "best-effort dispatcher kick unavailable in deployed environment",
      expect.objectContaining({
        hasInternalToken: false,
        hasBaseUrl: true,
        nodeEnv: "production",
      }),
    );
  });
});
