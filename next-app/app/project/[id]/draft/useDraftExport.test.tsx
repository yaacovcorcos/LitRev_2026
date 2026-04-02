// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDraftExport } from "./useDraftExport";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";

const mockGenerateDraftExportAction = vi.fn();
const mockPrependExport = vi.fn();
const mockRemoveExport = vi.fn();

vi.mock("@/app/actions/draft-exports", () => ({
  generateDraftExportAction: (...args: unknown[]) => mockGenerateDraftExportAction(...args),
}));

vi.mock("@/app/actions/files", () => ({
  deleteFileAssetAction: vi.fn(async () => ({ success: true })),
}));

vi.mock("./useProjectExportHistory", () => ({
  useProjectExportHistory: () => ({
    exportHistory: [],
    latestExport: null,
    prependExport: mockPrependExport,
    removeExport: mockRemoveExport,
  }),
}));

function createDraft() {
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
        content: [{ type: "paragraph", content: [{ type: "text", text: "Abstract text" }] }],
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

describe("useDraftExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateDraftExportAction.mockResolvedValue({
      success: true,
      data: {
        id: "file-1",
        projectId: "proj-1",
        kind: "export",
        format: "docx",
        filename: "Alpha-Draft-v1.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 1024,
        publicUrl: "https://example.com/file-1.docx",
        downloadUrl: "https://example.com/file-1.docx",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  });

  it("uses the server export action for DOCX export and prepends the returned file", async () => {
    const draft = createDraft();
    const flushContentCommit = vi.fn();

    const { result } = renderHook(() =>
      useDraftExport({
        projectId: "proj-1",
        projectName: "Alpha Draft",
        draft,
        getDraftSnapshot: () => draft,
        orderedSections: [
          { id: "abstract", label: "Abstract" },
          { id: "references", label: "References" },
        ],
        studies: [],
        flushContentCommit,
      }),
    );

    await act(async () => {
      await result.current.handleExportDocx();
    });

    expect(flushContentCommit).toHaveBeenCalled();
    expect(mockGenerateDraftExportAction).toHaveBeenCalledWith("proj-1", draft, {
      format: "docx",
      mode: "warn",
    });
    expect(mockPrependExport).toHaveBeenCalledWith(expect.objectContaining({ id: "file-1" }));
  });
});
