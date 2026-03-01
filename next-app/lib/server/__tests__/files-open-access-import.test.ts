import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAssertProjectAccess = vi.fn();
const mockStudyFindFirst = vi.fn();
const mockFileAssetFindMany = vi.fn();
const mockFileAssetCreate = vi.fn();
const mockResolveOpenAccessPdfCandidates = vi.fn();
const mockDownloadPdfWithGuards = vi.fn();
const mockIsOpenAccessPdfFetchEnabled = vi.fn();

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAssertProjectAccess(...args),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    study: {
      findFirst: (...args: unknown[]) => mockStudyFindFirst(...args),
    },
    fileAsset: {
      findMany: (...args: unknown[]) => mockFileAssetFindMany(...args),
      create: (...args: unknown[]) => mockFileAssetCreate(...args),
    },
  },
}));

vi.mock("@/lib/agent/feature-flags", () => ({
  isOpenAccessPdfFetchEnabled: (...args: unknown[]) =>
    mockIsOpenAccessPdfFetchEnabled(...args),
}));

vi.mock("@/lib/server/search/oa-resolver", () => ({
  resolveOpenAccessPdfCandidates: (...args: unknown[]) =>
    mockResolveOpenAccessPdfCandidates(...args),
}));

vi.mock("@/lib/server/pdf-download", () => ({
  downloadPdfWithGuards: (...args: unknown[]) => mockDownloadPdfWithGuards(...args),
  PdfDownloadError: class PdfDownloadError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "PdfDownloadError";
      this.code = code;
    }
  },
}));

function makeStudy() {
  return {
    id: "study-1",
    title: "Test Study",
    details: { doi: "10.1234/test.001", pmid: "12345678" },
  };
}

function makeFileAssetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-1",
    projectId: "project-1",
    studyId: "study-1",
    kind: "source",
    format: "pdf",
    filename: "paper.pdf",
    mimeType: "application/pdf",
    size: 1234,
    storagePath: "study-assets/projects/project-1/studies/study-1/paper.pdf",
    publicUrl: "https://example.test/paper.pdf",
    version: 1,
    metadata: null,
    createdAt: new Date("2026-03-02T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("importOpenAccessPdfForStudy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.SUPABASE_STORAGE_BUCKET = "study-assets";
    mockAssertProjectAccess.mockResolvedValue({
      ownerId: "user-1",
      workspaceId: "ws-1",
    });
    mockStudyFindFirst.mockResolvedValue(makeStudy());
    mockFileAssetFindMany.mockResolvedValue([]);
    mockIsOpenAccessPdfFetchEnabled.mockReturnValue(true);
    mockResolveOpenAccessPdfCandidates.mockResolvedValue({
      doi: "10.1234/test.001",
      pmid: undefined,
      pmcid: undefined,
      candidates: [],
      diagnostics: [],
    });
    mockDownloadPdfWithGuards.mockResolvedValue({
      buffer: Buffer.from("%PDF-1.7\nok", "utf-8"),
      contentType: "application/pdf",
      finalUrl: "https://publisher.test/paper.pdf",
      redirects: 0,
      checksumSha256: "a".repeat(64),
      size: 11,
    });
    mockFileAssetCreate.mockResolvedValue(makeFileAssetRow());
  });

  it("returns FEATURE_DISABLED when feature flag is off", async () => {
    mockIsOpenAccessPdfFetchEnabled.mockReturnValue(false);
    const { importOpenAccessPdfForStudy } = await import("../files");

    const result = await importOpenAccessPdfForStudy(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1",
      "study-1"
    );

    expect(result).toMatchObject({
      success: false,
      status: "failed",
      errorCode: "FEATURE_DISABLED",
    });
    expect(mockAssertProjectAccess).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1"
    );
  });

  it("returns NO_OA_PDF_FOUND with diagnostics when resolver has no candidates", async () => {
    mockResolveOpenAccessPdfCandidates.mockResolvedValue({
      doi: "10.1234/test.001",
      pmid: undefined,
      pmcid: undefined,
      candidates: [],
      diagnostics: ["resolver unavailable"],
    });
    const { importOpenAccessPdfForStudy } = await import("../files");

    const result = await importOpenAccessPdfForStudy(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1",
      "study-1"
    );

    expect(result).toMatchObject({
      success: false,
      status: "failed",
      errorCode: "NO_OA_PDF_FOUND",
      diagnostics: ["resolver unavailable"],
    });
  });

  it("dedupes by checksum even when existing file mimeType is not application/pdf", async () => {
    mockResolveOpenAccessPdfCandidates.mockResolvedValue({
      doi: "10.1234/test.001",
      pmid: undefined,
      pmcid: undefined,
      candidates: [
        {
          url: "https://publisher.test/paper.pdf",
          provider: "unpaywall",
          evidence: "unpaywall_is_oa",
          score: 90,
        },
      ],
      diagnostics: [],
    });
    mockFileAssetFindMany.mockResolvedValue([
      makeFileAssetRow({
        id: "file-existing",
        mimeType: "application/octet-stream",
        format: "pdf",
        metadata: { fileHash: "a".repeat(64) },
      }),
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as typeof fetch);
    const { importOpenAccessPdfForStudy } = await import("../files");

    const result = await importOpenAccessPdfForStudy(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1",
      "study-1"
    );

    expect(result).toMatchObject({
      success: true,
      status: "already_exists",
      checksumSha256: "a".repeat(64),
    });
    expect(mockFileAssetCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("imports and stores metadata when no duplicate exists", async () => {
    mockResolveOpenAccessPdfCandidates.mockResolvedValue({
      doi: "10.1234/test.001",
      pmid: "12345678",
      pmcid: undefined,
      candidates: [
        {
          url: "https://publisher.test/paper.pdf",
          provider: "unpaywall",
          evidence: "unpaywall_is_oa",
          score: 90,
        },
      ],
      diagnostics: [],
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    );
    vi.stubGlobal("fetch", fetchMock as typeof fetch);
    const { importOpenAccessPdfForStudy } = await import("../files");

    const result = await importOpenAccessPdfForStudy(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1",
      "study-1"
    );

    expect(result).toMatchObject({
      success: true,
      status: "imported",
      provider: "unpaywall",
    });
    expect(mockFileAssetCreate).toHaveBeenCalledTimes(1);
    const createPayload = mockFileAssetCreate.mock.calls[0]?.[0] as {
      data: { metadata?: Record<string, unknown> };
    };
    expect(createPayload.data.metadata).toMatchObject({
      importSource: "open-access-fetch",
      resolverProvider: "unpaywall",
      doi: "10.1234/test.001",
      pmid: "12345678",
      fileHash: "a".repeat(64),
    });
  });
});
