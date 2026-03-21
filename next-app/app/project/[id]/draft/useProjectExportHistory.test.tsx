// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectExportHistory } from "./useProjectExportHistory";

const mockListProjectFilesAction = vi.fn();

vi.mock("@/app/actions/files", () => ({
  listProjectFilesAction: (...args: unknown[]) => mockListProjectFilesAction(...args),
}));

describe("useProjectExportHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the visible export history DOCX-only", async () => {
    mockListProjectFilesAction.mockResolvedValue({
      success: true,
      data: [
        {
          id: "docx-1",
          projectId: "proj-1",
          kind: "export",
          format: "docx",
          filename: "alpha-v1.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 10,
          storagePath: "study-assets/projects/proj-1/exports/docx/docx-1",
          version: 1,
          createdAt: "2026-03-21T12:00:00.000Z",
          updatedAt: "2026-03-21T12:00:00.000Z",
        },
        {
          id: "md-1",
          projectId: "proj-1",
          kind: "export",
          format: "markdown",
          filename: "alpha-v1.md",
          mimeType: "text/markdown",
          size: 10,
          storagePath: "study-assets/projects/proj-1/exports/markdown/md-1",
          version: 1,
          createdAt: "2026-03-21T13:00:00.000Z",
          updatedAt: "2026-03-21T13:00:00.000Z",
        },
      ],
    });

    const { result } = renderHook(() => useProjectExportHistory("proj-1"));

    await waitFor(() => {
      expect(result.current.exportHistory).toHaveLength(1);
    });

    expect(result.current.exportHistory[0]?.format).toBe("docx");
    expect(result.current.latestExport?.id).toBe("docx-1");
  });
});
