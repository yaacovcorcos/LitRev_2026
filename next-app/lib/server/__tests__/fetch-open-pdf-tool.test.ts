import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOpenPdfTool } from "@/lib/server/ai/tools/fetch-open-pdf";

const mockImportOpenAccessPdfForStudy = vi.fn();

vi.mock("@/lib/server/files", () => ({
  importOpenAccessPdfForStudy: (...args: unknown[]) =>
    mockImportOpenAccessPdfForStudy(...args),
}));

describe("fetchOpenPdfTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires project context", async () => {
    const result = await fetchOpenPdfTool.execute({ studyId: "s1" });
    expect(result.error).toContain("project context");
  });

  it("requires study context", async () => {
    const result = await fetchOpenPdfTool.execute({}, { projectId: "p1" });
    expect(result.error).toContain("No study specified");
  });

  it("returns imported success payload", async () => {
    mockImportOpenAccessPdfForStudy.mockResolvedValue({
      success: true,
      status: "imported",
      studyId: "study-1",
      fileAsset: {
        id: "file-1",
        filename: "paper.pdf",
      },
      provider: "unpaywall",
      sourceUrl: "https://publisher.example/paper.pdf",
      finalUrl: "https://publisher.example/paper.pdf",
      checksumSha256: "a".repeat(64),
    });

    const result = await fetchOpenPdfTool.execute(
      { studyId: "study-1" },
      { projectId: "proj-1", studyId: "study-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({
      success: true,
      status: "imported",
      fileAssetId: "file-1",
      filename: "paper.pdf",
      provider: "unpaywall",
    });
    expect(mockImportOpenAccessPdfForStudy).toHaveBeenCalledWith(
      undefined,
      "proj-1",
      "study-1",
      { doi: undefined, pmid: undefined }
    );
  });

  it("returns deterministic failed payload when import fails", async () => {
    mockImportOpenAccessPdfForStudy.mockResolvedValue({
      success: false,
      status: "failed",
      errorCode: "NO_OA_PDF_FOUND",
      error: "No free full-text PDF was found for this study.",
    });

    const result = await fetchOpenPdfTool.execute(
      { studyId: "study-1" },
      { projectId: "proj-1", studyId: "study-1" }
    );

    expect(result.result).toMatchObject({
      success: false,
      status: "failed",
      errorCode: "NO_OA_PDF_FOUND",
    });
    expect(result.error).toContain("No free full-text PDF");
  });
});
