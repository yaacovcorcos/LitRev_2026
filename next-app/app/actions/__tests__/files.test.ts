import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(),
  createFileAsset: vi.fn(),
  deleteFileAsset: vi.fn(),
  listProjectFiles: vi.fn(),
  listStudyFiles: vi.fn(),
  uploadStudyFile: vi.fn(),
  importStudyWithPdf: vi.fn(),
  uploadChatAttachment: vi.fn(),
  extractTextFromExistingFile: vi.fn(),
  getStudy: vi.fn(),
  enqueueStudyProcessingJob: vi.fn(),
  kickStudyProcessingDispatcher: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  withAuth: (handler: (session: { userId: string; workspaceId: string }) => Promise<unknown>) =>
    mocks.withAuth(handler),
}));

vi.mock("@/lib/server/files", () => ({
  createFileAsset: (...args: unknown[]) => mocks.createFileAsset(...args),
  deleteFileAsset: (...args: unknown[]) => mocks.deleteFileAsset(...args),
  listProjectFiles: (...args: unknown[]) => mocks.listProjectFiles(...args),
  listStudyFiles: (...args: unknown[]) => mocks.listStudyFiles(...args),
  uploadStudyFile: (...args: unknown[]) => mocks.uploadStudyFile(...args),
  importStudyWithPdf: (...args: unknown[]) => mocks.importStudyWithPdf(...args),
  uploadChatAttachment: (...args: unknown[]) => mocks.uploadChatAttachment(...args),
  extractTextFromExistingFile: (...args: unknown[]) => mocks.extractTextFromExistingFile(...args),
}));

vi.mock("@/lib/server/ledger", () => ({
  getStudy: (...args: unknown[]) => mocks.getStudy(...args),
}));

vi.mock("@/lib/server/study-processing", () => ({
  enqueueStudyProcessingJob: (...args: unknown[]) => mocks.enqueueStudyProcessingJob(...args),
  kickStudyProcessingDispatcher: (...args: unknown[]) => mocks.kickStudyProcessingDispatcher(...args),
}));

vi.mock("@/lib/server/logging", () => ({
  logServerError: (...args: unknown[]) => mocks.logServerError(...args),
}));

import { importStudyWithPdfAction } from "@/app/actions/files";

const IMPORT_LOCAL_SCHEMA_DRIFT_MESSAGE =
  "PDF uploaded, but the app could not continue the follow-up processing flow because your local database schema is behind. Run npx prisma migrate dev from next-app/.";

function createPdfFormData() {
  const formData = new FormData();
  formData.append("file", new File(["pdf"], "study.pdf", { type: "application/pdf" }));
  return formData;
}

describe("files actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/litrev_dev");
    vi.stubEnv("DIRECT_URL", "postgresql://postgres:postgres@localhost:5432/litrev_dev");

    mocks.withAuth.mockImplementation((handler: (session: { userId: string; workspaceId: string }) => Promise<unknown>) =>
      handler({ userId: "user-1", workspaceId: "ws-1" }),
    );
    mocks.kickStudyProcessingDispatcher.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns LOCAL_SCHEMA_DRIFT when post-import processing hits local schema drift", async () => {
    mocks.importStudyWithPdf.mockResolvedValue({
      study: {
        id: "study-1",
        title: "Study",
        authors: "Unknown",
        year: 2026,
        status: "pending",
        quality: "-",
      },
      fileAsset: {
        id: "file-1",
        projectId: "project-1",
        studyId: "study-1",
        kind: "source",
        format: "pdf",
        filename: "study.pdf",
        mimeType: "application/pdf",
        size: 123,
        storagePath: "study-assets/projects/project-1/studies/study-1/file-1-study.pdf",
        publicUrl: "https://example.test/study.pdf",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    mocks.enqueueStudyProcessingJob.mockRejectedValue(
      new Error('The table `public.StudyProcessingJob` does not exist in the current database.'),
    );

    const result = await importStudyWithPdfAction("project-1", createPdfFormData());

    expect(result).toEqual({
      success: false,
      error: IMPORT_LOCAL_SCHEMA_DRIFT_MESSAGE,
      errorCode: "LOCAL_SCHEMA_DRIFT",
    });
    expect(mocks.getStudy).not.toHaveBeenCalled();
  });

  it("keeps post-import failures generic outside local schema drift", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@db.example.com:5432/litrev_prod");
    vi.stubEnv("DIRECT_URL", "postgresql://postgres:postgres@db.example.com:5432/litrev_prod");

    mocks.importStudyWithPdf.mockResolvedValue({
      study: {
        id: "study-1",
        title: "Study",
        authors: "Unknown",
        year: 2026,
        status: "pending",
        quality: "-",
      },
      fileAsset: {
        id: "file-1",
        projectId: "project-1",
        studyId: "study-1",
        kind: "source",
        format: "pdf",
        filename: "study.pdf",
        mimeType: "application/pdf",
        size: 123,
        storagePath: "study-assets/projects/project-1/studies/study-1/file-1-study.pdf",
        publicUrl: "https://example.test/study.pdf",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    mocks.enqueueStudyProcessingJob.mockRejectedValue(
      new Error('The table `public.StudyProcessingJob` does not exist in the current database.'),
    );

    const result = await importStudyWithPdfAction("project-1", createPdfFormData());

    expect(result).toEqual({
      success: false,
      error: "PDF uploaded, but the app could not continue the follow-up processing flow. Please refresh and try again.",
      errorCode: undefined,
    });
  });

  it("returns enriched study data after successful import and processing enqueue", async () => {
    mocks.importStudyWithPdf.mockResolvedValue({
      study: {
        id: "study-1",
        title: "Study",
        authors: "Unknown",
        year: 2026,
        status: "pending",
        quality: "-",
      },
      fileAsset: {
        id: "file-1",
        projectId: "project-1",
        studyId: "study-1",
        kind: "source",
        format: "pdf",
        filename: "study.pdf",
        mimeType: "application/pdf",
        size: 123,
        storagePath: "study-assets/projects/project-1/studies/study-1/file-1-study.pdf",
        publicUrl: "https://example.test/study.pdf",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    mocks.enqueueStudyProcessingJob.mockResolvedValue({
      transitionHint: "accepted",
    });
    mocks.getStudy.mockResolvedValue({
      id: "study-1",
      title: "Refined Study",
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
    });

    const result = await importStudyWithPdfAction("project-1", createPdfFormData());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.study).toMatchObject({ id: "study-1", title: "Refined Study" });
      expect(result.data.fileAsset.id).toBe("file-1");
    }
    expect(mocks.kickStudyProcessingDispatcher).toHaveBeenCalledTimes(1);
  });
});
