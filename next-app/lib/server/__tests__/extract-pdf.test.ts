import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  studyFindFirst: vi.fn(),
  processingJobCreate: vi.fn(),
  processingJobFindUnique: vi.fn(),
  processingJobUpdateMany: vi.fn(),
  fileFindFirst: vi.fn(),
  studyUpdate: vi.fn(),
  extractStudyFromPdf: vi.fn(),
  deepAnalyzeStudyFromPdf: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    study: {
      findFirst: mocks.studyFindFirst,
      update: mocks.studyUpdate,
    },
    studyProcessingJob: {
      create: mocks.processingJobCreate,
      findUnique: mocks.processingJobFindUnique,
      updateMany: mocks.processingJobUpdateMany,
    },
    fileAsset: {
      findFirst: mocks.fileFindFirst,
    },
  },
}));

vi.mock("@/lib/server/pdf-extraction", () => ({
  extractStudyFromPdf: mocks.extractStudyFromPdf,
  deepAnalyzeStudyFromPdf: mocks.deepAnalyzeStudyFromPdf,
}));

vi.mock("@/lib/server/memory/study-memory", () => ({
  createMemoriesFromDeepAnalysis: vi.fn(),
}));

const { extractPdfTool } = await import("@/lib/server/ai/tools/extract-pdf");

describe("extract_pdf cancellation", () => {
  it("exposes direct mutation only at autonomy level 3 or 4", () => {
    expect(extractPdfTool.autonomy).toMatchObject({
      defaultLevel: 3,
      allowedRange: [3, 4],
    });
    expect(extractPdfTool.definition.description).toContain("direct mutation");
    expect(extractPdfTool.definition.description).toContain(
      "preview_study_pdf_update",
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        study: { update: mocks.studyUpdate },
        studyProcessingJob: { updateMany: mocks.processingJobUpdateMany },
      }),
    );
    mocks.studyFindFirst.mockResolvedValue({
      id: "study-1",
      title: "Study",
      authors: "Researcher",
      year: 2025,
      details: {},
    });
    mocks.processingJobCreate.mockResolvedValue({ id: "job-1" });
    mocks.processingJobFindUnique.mockResolvedValue({
      id: "job-1",
      startedAt: new Date(),
    });
    mocks.processingJobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.studyUpdate.mockResolvedValue({ id: "study-1" });
    mocks.fileFindFirst.mockResolvedValue({
      id: "file-1",
      projectId: "project-1",
      studyId: "study-1",
      kind: "source",
      filename: "study.pdf",
      mimeType: "application/pdf",
      storagePath: "projects/project-1/studies/study-1/study.pdf",
      publicUrl: null,
    });
  });

  it("passes the owning signal to quick extraction and propagates cancellation", async () => {
    const controller = new AbortController();
    mocks.extractStudyFromPdf.mockImplementationOnce(
      async (_file, _projectId, options) => {
        expect(options).toEqual({ signal: controller.signal });
        controller.abort();
        throw new DOMException("cancelled", "AbortError");
      },
    );

    await expect(
      extractPdfTool.execute(
        {},
        {
          projectId: "project-1",
          studyId: "study-1",
          signal: controller.signal,
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(mocks.studyUpdate).not.toHaveBeenCalled();
    expect(mocks.processingJobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "job-1", state: "running" }),
        data: expect.objectContaining({ state: "failed" }),
      }),
    );
  });

  it("passes the owning signal to deep extraction", async () => {
    const controller = new AbortController();
    mocks.deepAnalyzeStudyFromPdf.mockResolvedValueOnce({
      success: false,
      details: {},
      error: "Deep analysis timed out",
      errorCode: "AI_FAILED",
    });

    const result = await extractPdfTool.execute(
      { deep: true },
      {
        projectId: "project-1",
        studyId: "study-1",
        signal: controller.signal,
      },
    );

    expect(result.error).toBe("Deep analysis timed out");
    expect(mocks.deepAnalyzeStudyFromPdf).toHaveBeenCalledWith(
      expect.objectContaining({ id: "file-1" }),
      expect.objectContaining({ title: "Study", authors: "Researcher" }),
      "project-1",
      { signal: controller.signal },
    );
    expect(mocks.studyUpdate).not.toHaveBeenCalled();
  });

  it("atomically admits only one concurrent extraction for a study phase", async () => {
    let resolveExtraction!: (value: {
      success: true;
      title: string;
      authors: string;
      year: number;
      details: Record<string, unknown>;
    }) => void;
    const extraction = new Promise<{
      success: true;
      title: string;
      authors: string;
      year: number;
      details: Record<string, unknown>;
    }>((resolve) => {
      resolveExtraction = resolve;
    });
    mocks.extractStudyFromPdf.mockReturnValueOnce(extraction);
    mocks.processingJobCreate
      .mockResolvedValueOnce({ id: "job-1" })
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate"), { code: "P2002" }),
      );
    mocks.processingJobUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });

    const first = extractPdfTool.execute(
      {},
      {
        projectId: "project-1",
        studyId: "study-1",
      },
    );
    await vi.waitFor(() =>
      expect(mocks.extractStudyFromPdf).toHaveBeenCalledTimes(1),
    );

    const second = await extractPdfTool.execute(
      {},
      {
        projectId: "project-1",
        studyId: "study-1",
      },
    );
    expect(second).toMatchObject({
      result: null,
      error: "Extraction is already running for this study.",
    });

    resolveExtraction({
      success: true,
      title: "Extracted study",
      authors: "Researcher",
      year: 2025,
      details: { abstract: "Result" },
    });
    await expect(first).resolves.toMatchObject({
      result: { success: true, title: "Extracted study" },
    });
    expect(mocks.extractStudyFromPdf).toHaveBeenCalledTimes(1);
    expect(mocks.studyUpdate).toHaveBeenCalledTimes(1);
  });

  it("reclaims an expired processing lease before extracting", async () => {
    let claimedStartedAt: Date | undefined;
    mocks.processingJobCreate.mockRejectedValueOnce(
      Object.assign(new Error("duplicate"), { code: "P2002" }),
    );
    mocks.processingJobUpdateMany.mockImplementationOnce(async (query) => {
      claimedStartedAt = query.data.startedAt;
      return { count: 1 };
    });
    mocks.processingJobFindUnique.mockImplementationOnce(async () => ({
      id: "job-expired",
      startedAt: claimedStartedAt,
    }));
    mocks.extractStudyFromPdf.mockResolvedValueOnce({
      success: true,
      title: "Extracted study",
      authors: "Researcher",
      year: 2025,
      details: { abstract: "Result" },
    });

    const result = await extractPdfTool.execute(
      {},
      { projectId: "project-1", studyId: "study-1" },
    );

    expect(result.error).toBeUndefined();
    expect(mocks.processingJobUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              state: "running",
              leaseExpiresAt: expect.any(Object),
            }),
          ]),
        }),
      }),
    );
    expect(mocks.extractStudyFromPdf).toHaveBeenCalledTimes(1);
  });

  it("does not take over a queued or unexpired processing job", async () => {
    mocks.processingJobCreate.mockRejectedValueOnce(
      Object.assign(new Error("duplicate"), { code: "P2002" }),
    );
    mocks.processingJobUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await extractPdfTool.execute(
      {},
      { projectId: "project-1", studyId: "study-1" },
    );

    expect(result).toMatchObject({
      result: null,
      error: "Extraction is already running for this study.",
    });
    expect(mocks.extractStudyFromPdf).not.toHaveBeenCalled();
  });

  it("refuses to write study data after losing its extraction lease", async () => {
    mocks.extractStudyFromPdf.mockResolvedValueOnce({
      success: true,
      title: "Extracted study",
      authors: "Researcher",
      year: 2025,
      details: { abstract: "Result" },
    });
    mocks.processingJobUpdateMany.mockResolvedValue({ count: 0 });

    const result = await extractPdfTool.execute(
      {},
      {
        projectId: "project-1",
        studyId: "study-1",
      },
    );

    expect(result).toMatchObject({
      result: null,
      error: "PDF extraction lease was lost before the study update.",
    });
    expect(mocks.studyUpdate).not.toHaveBeenCalled();
  });

  it("settles the lease and study write in one transaction", async () => {
    mocks.extractStudyFromPdf.mockResolvedValueOnce({
      success: true,
      title: "Extracted study",
      authors: "Researcher",
      year: 2025,
      details: { abstract: "Result" },
    });

    const result = await extractPdfTool.execute(
      {},
      { projectId: "project-1", studyId: "study-1" },
    );

    expect(result.error).toBeUndefined();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.processingJobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "job-1", state: "running" }),
        data: expect.objectContaining({ state: "succeeded" }),
      }),
    );
    expect(mocks.studyUpdate).toHaveBeenCalledTimes(1);
  });

  it("fails the job when the atomic study update transaction rolls back", async () => {
    mocks.extractStudyFromPdf.mockResolvedValueOnce({
      success: true,
      title: "Extracted study",
      authors: "Researcher",
      year: 2025,
      details: { abstract: "Result" },
    });
    mocks.studyUpdate.mockRejectedValueOnce(new Error("study write failed"));

    const result = await extractPdfTool.execute(
      {},
      { projectId: "project-1", studyId: "study-1" },
    );

    expect(result).toMatchObject({ result: null, error: "study write failed" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.processingJobUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: "failed" }) }),
    );
  });
});
