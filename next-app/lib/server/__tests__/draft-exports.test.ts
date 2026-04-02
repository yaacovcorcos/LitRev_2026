import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Study } from "@/types/ledger";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";

const mockAssertProjectAccess = vi.fn();
const mockListStudies = vi.fn();
const mockUploadGeneratedProjectFile = vi.fn();
const mockDeleteFileAsset = vi.fn();
const mockCreateDraftCheckpoint = vi.fn();
const mockFileAssetFindFirst = vi.fn();
const mockProjectFindFirst = vi.fn();

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAssertProjectAccess(...args),
}));

vi.mock("@/lib/server/ledger", () => ({
  listStudies: (...args: unknown[]) => mockListStudies(...args),
}));

vi.mock("@/lib/server/files", () => ({
  uploadGeneratedProjectFile: (...args: unknown[]) => mockUploadGeneratedProjectFile(...args),
  deleteFileAsset: (...args: unknown[]) => mockDeleteFileAsset(...args),
}));

vi.mock("@/lib/server/draft-checkpoints", () => ({
  createDraftCheckpoint: (...args: unknown[]) => mockCreateDraftCheckpoint(...args),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    fileAsset: {
      findFirst: (...args: unknown[]) => mockFileAssetFindFirst(...args),
    },
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
  },
}));

import { generateDraftExport } from "@/lib/server/draft-exports";

const scope = { ownerId: "user-1", workspaceId: "ws-1" };

function createDraftSnapshot() {
  return {
    version: 2 as const,
    mode: "section" as const,
    activeSection: "abstract",
    sectionOrder: ["abstract", "references"],
    customSections: {},
    formattingBySection: {
      [UNSECTIONED_DRAFT_ID]: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      abstract: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      references: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
    },
    panels: {
      ledgerWidth: 320,
      copilotWidth: 360,
      ledgerCollapsed: false,
      copilotCollapsed: false,
    },
    contentBySection: {
      [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [{ type: "paragraph" }] },
      abstract: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Summary " },
              { type: "citation", attrs: { studyId: "study-1", uid: "cit-1" } },
            ],
          },
        ],
      },
      references: { type: "doc", content: [{ type: "paragraph" }] },
    },
    ledgerBySection: {
      [UNSECTIONED_DRAFT_ID]: [],
      abstract: [],
      references: [],
    },
    copilotBySection: {
      [UNSECTIONED_DRAFT_ID]: [],
      abstract: [],
      references: [],
    },
    manuscript: {
      schemaVersion: 2 as const,
      doc: { type: "doc", content: [] },
      sections: [
        {
          sectionId: "abstract",
          sectionNodeId: "sec:abstract",
          kind: "base" as const,
          label: "Abstract",
        },
        {
          sectionId: "references",
          sectionNodeId: "sec:references",
          kind: "base" as const,
          label: "References",
        },
      ],
    },
  };
}

const studies: Study[] = [
  {
    id: "study-1",
    title: "Study One",
    authors: "Smith J",
    year: 2020,
    status: "active",
    quality: "High",
    details: { journal: "Journal A", doi: "10.1000/a" },
  },
];

describe("generateDraftExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertProjectAccess.mockResolvedValue({ ownerId: "user-1", workspaceId: "ws-1" });
    mockProjectFindFirst.mockResolvedValue({ name: "Alpha Draft" });
    mockFileAssetFindFirst.mockResolvedValue(null);
    mockListStudies.mockResolvedValue(studies);
    mockCreateDraftCheckpoint.mockResolvedValue({ id: "checkpoint-1" });
    mockUploadGeneratedProjectFile.mockImplementation(async (_scope, _projectId, input) => ({
      id: "file-1",
      projectId: "proj-1",
      kind: input.kind,
      format: input.format,
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      publicUrl: "https://example.com/file-1",
      downloadUrl: "https://example.com/file-1",
      version: input.version ?? 1,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });

  it("renders and stores a real DOCX export file asset", async () => {
    const result = await generateDraftExport(scope, "proj-1", createDraftSnapshot(), {
      format: "docx",
      mode: "warn",
    });

    expect(mockUploadGeneratedProjectFile).toHaveBeenCalledWith(
      scope,
      "proj-1",
      expect.objectContaining({
        directory: "exports/docx",
        kind: "export",
        format: "docx",
        filename: "Alpha-Draft-v1.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        version: 1,
        metadata: expect.objectContaining({
          diagnosticCount: 0,
          citationIssueCount: 0,
          readinessWarningCount: 0,
          blockingCitationIssueCount: 0,
        }),
      }),
    );
    const uploadInput = mockUploadGeneratedProjectFile.mock.calls[0]?.[2];
    expect(uploadInput.bytes.byteLength).toBeGreaterThan(0);
    expect(Buffer.from(uploadInput.bytes).subarray(0, 2).toString()).toBe("PK");
    expect(result.format).toBe("docx");
    expect(mockCreateDraftCheckpoint).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        projectId: "proj-1",
        kind: "export",
        fileAssetId: "file-1",
        label: "Export Alpha-Draft-v1.docx",
      }),
    );
  });

  it("allows strict exports when only advisory readiness diagnostics remain", async () => {
    const result = await generateDraftExport(
      scope,
      "proj-1",
      {
        ...createDraftSnapshot(),
        contentBySection: {
          [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [{ type: "paragraph" }] },
          abstract: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Meaningful prose without inline citations." }],
              },
            ],
          },
          references: { type: "doc", content: [{ type: "paragraph" }] },
        },
        ledgerBySection: {
          [UNSECTIONED_DRAFT_ID]: [],
          abstract: ["study-1"],
          references: [],
        },
      },
      {
        format: "docx",
        mode: "strict",
      },
    );

    expect(result.format).toBe("docx");
    expect(mockUploadGeneratedProjectFile).toHaveBeenCalledWith(
      scope,
      "proj-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          diagnosticCount: 2,
          citationIssueCount: 0,
          readinessWarningCount: 2,
          blockingCitationIssueCount: 0,
        }),
      }),
    );
  });

  it("blocks strict exports when blocking citation issues remain", async () => {
    await expect(
      generateDraftExport(
        scope,
        "proj-1",
        {
          ...createDraftSnapshot(),
          contentBySection: {
            [UNSECTIONED_DRAFT_ID]: { type: "doc", content: [{ type: "paragraph" }] },
            abstract: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "citation", attrs: { studyId: "missing-study", uid: "cit-1" } }],
                },
              ],
            },
            references: { type: "doc", content: [{ type: "paragraph" }] },
          },
        },
        {
          format: "docx",
          mode: "strict",
        },
      ),
    ).rejects.toThrow("Export blocked in strict mode: fix missing citation targets before exporting.");

    expect(mockUploadGeneratedProjectFile).not.toHaveBeenCalled();
  });

  it("rolls back the uploaded export file when export checkpoint creation fails", async () => {
    mockCreateDraftCheckpoint.mockRejectedValueOnce(new Error("checkpoint failed"));

    await expect(
      generateDraftExport(scope, "proj-1", createDraftSnapshot(), {
        format: "docx",
        mode: "warn",
      }),
    ).rejects.toThrow("checkpoint failed");

    expect(mockDeleteFileAsset).toHaveBeenCalledWith(scope, "proj-1", "file-1");
  });
});
