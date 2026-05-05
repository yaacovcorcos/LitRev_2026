import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SUPABASE_URL = "https://supabase.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const mocks = vi.hoisted(() => ({
  assertProjectAccess: vi.fn(),
  prisma: {
    fileAsset: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: mocks.assertProjectAccess,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/server/ledger", () => ({
  listStudies: vi.fn(),
}));

const { uploadStudyFile } = await import("@/lib/server/files");

const PDF_BYTES = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n";
const DOCX_BYTES = "PK\u0003\u0004[Content_Types].xml word/document.xml";

function createdFileAsset(overrides: Partial<{
  filename: string;
  format: string;
  mimeType: string;
  size: number;
  storagePath: string;
}> = {}) {
  return {
    id: "file-1",
    projectId: "proj-1",
    workspaceId: "workspace-1",
    studyId: "study-1",
    kind: "source",
    format: overrides.format ?? "pdf",
    filename: overrides.filename ?? "paper.pdf",
    mimeType: overrides.mimeType ?? "application/pdf",
    size: overrides.size ?? PDF_BYTES.length,
    storagePath: overrides.storagePath ?? "study-assets/projects/proj-1/studies/study-1/paper.pdf",
    publicUrl: null,
    version: 1,
    metadata: null,
    createdAt: new Date("2026-05-05T00:00:00.000Z"),
    updatedAt: new Date("2026-05-05T00:00:00.000Z"),
  };
}

describe("uploadStudyFile server validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertProjectAccess.mockResolvedValue({
      ownerId: "user-1",
      workspaceId: "workspace-1",
    });
    mocks.prisma.fileAsset.create.mockImplementation(({ data }) =>
      Promise.resolve(createdFileAsset({
        filename: data.filename,
        format: data.format,
        mimeType: data.mimeType,
        size: data.size,
        storagePath: data.storagePath,
      })),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
  });

  it("stores valid PDFs with a canonical MIME type even when the caller spoofs the browser MIME", async () => {
    const uploaded = await uploadStudyFile(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      "study-1",
      new File([PDF_BYTES], "paper.pdf", { type: "text/html" }),
    );

    expect(uploaded.format).toBe("pdf");
    expect(uploaded.mimeType).toBe("application/pdf");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/storage/v1/object/study-assets/projects/proj-1/studies/study-1/"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/pdf",
        }),
      }),
    );
    expect(mocks.prisma.fileAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          format: "pdf",
          mimeType: "application/pdf",
        }),
      }),
    );
  });

  it("stores valid DOCX files with a canonical MIME type", async () => {
    const uploaded = await uploadStudyFile(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      "study-1",
      new File([DOCX_BYTES], "paper.docx", { type: "application/octet-stream" }),
    );

    expect(uploaded.format).toBe("docx");
    expect(uploaded.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      }),
    );
  });

  it.each([
    ["HTML disguised as PDF", new File(["<script>alert(1)</script>"], "paper.pdf", { type: "text/html" })],
    ["SVG disguised as PDF", new File(["<svg><script>alert(1)</script></svg>"], "paper.pdf", { type: "image/svg+xml" })],
    ["PDF bytes with an unsafe extension", new File([PDF_BYTES], "paper.html", { type: "application/pdf" })],
    ["ZIP bytes without DOCX package markers", new File(["PK\u0003\u0004not-a-docx"], "paper.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })],
  ])("rejects %s before storage", async (_label, file) => {
    await expect(uploadStudyFile(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      "study-1",
      file,
    )).rejects.toThrow(/Only (valid )?PDF and DOCX files are allowed/);

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.prisma.fileAsset.create).not.toHaveBeenCalled();
  });
});
