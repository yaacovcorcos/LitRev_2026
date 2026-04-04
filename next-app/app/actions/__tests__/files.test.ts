import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(),
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

import {
  extractTextFromExistingFileAction,
  importStudyWithPdfAction,
  uploadChatAttachmentAction,
} from "@/app/actions/files";

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
        publicUrl: "https://example.test/study.pdf",
        downloadUrl: "https://example.test/study.pdf",
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
        publicUrl: "https://example.test/study.pdf",
        downloadUrl: "https://example.test/study.pdf",
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
        publicUrl: "https://example.test/study.pdf",
        downloadUrl: "https://example.test/study.pdf",
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

  it("returns structured extraction status for newly uploaded chat attachments", async () => {
    mocks.uploadChatAttachment.mockResolvedValue({
      fileAsset: {
        id: "file-1",
        filename: "study.pdf",
        size: 123,
        mimeType: "application/pdf",
      },
      extraction: {
        status: "failed",
        reason: "pdf_parse_failed",
        message: "LitRev uploaded the PDF, but could not read usable text from it. Remove it or attach a different PDF.",
      },
    });

    const result = await uploadChatAttachmentAction("project-1", createPdfFormData());

    expect(result).toEqual({
      success: true,
      data: {
        fileAssetId: "file-1",
        filename: "study.pdf",
        size: 123,
        mimeType: "application/pdf",
        extraction: {
          status: "failed",
          reason: "pdf_parse_failed",
          message: "LitRev uploaded the PDF, but could not read usable text from it. Remove it or attach a different PDF.",
        },
      },
    });
  });

  it("returns ready extraction text for newly uploaded chat attachments", async () => {
    mocks.uploadChatAttachment.mockResolvedValue({
      fileAsset: {
        id: "file-1",
        filename: "study.pdf",
        size: 123,
        mimeType: "application/pdf",
      },
      extraction: {
        status: "ready",
        text: "Extracted PDF text",
      },
    });

    const result = await uploadChatAttachmentAction("project-1", createPdfFormData());

    expect(result).toEqual({
      success: true,
      data: {
        fileAssetId: "file-1",
        filename: "study.pdf",
        size: 123,
        mimeType: "application/pdf",
        extraction: {
          status: "ready",
          text: "Extracted PDF text",
        },
      },
    });
  });

  it("returns structured extraction status for existing PDF attachments", async () => {
    mocks.extractTextFromExistingFile.mockResolvedValue({
      fileAsset: {
        id: "file-1",
        filename: "study.pdf",
        size: 123,
        mimeType: "application/pdf",
      },
      extraction: {
        status: "failed",
        reason: "storage_fetch_failed",
        message: "LitRev found the PDF, but could not load it for chat. Remove it or try again.",
      },
    });

    const result = await extractTextFromExistingFileAction("project-1", "file-1");

    expect(result).toEqual({
      success: true,
      data: {
        fileAssetId: "file-1",
        filename: "study.pdf",
        size: 123,
        mimeType: "application/pdf",
        extraction: {
          status: "failed",
          reason: "storage_fetch_failed",
          message: "LitRev found the PDF, but could not load it for chat. Remove it or try again.",
        },
      },
    });
  });

  it("returns ready extraction text for existing PDF attachments", async () => {
    mocks.extractTextFromExistingFile.mockResolvedValue({
      fileAsset: {
        id: "file-1",
        filename: "study.pdf",
        size: 123,
        mimeType: "application/pdf",
      },
      extraction: {
        status: "ready",
        text: "Recovered study text",
      },
    });

    const result = await extractTextFromExistingFileAction("project-1", "file-1");

    expect(result).toEqual({
      success: true,
      data: {
        fileAssetId: "file-1",
        filename: "study.pdf",
        size: 123,
        mimeType: "application/pdf",
        extraction: {
          status: "ready",
          text: "Recovered study text",
        },
      },
    });
  });
});
