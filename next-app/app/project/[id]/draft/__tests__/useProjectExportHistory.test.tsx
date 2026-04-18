// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { FileAsset } from "@/types/files";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectExportHistory } from "../useProjectExportHistory";

const mockListProjectFilesAction = vi.fn();

vi.mock("@/app/actions/files", () => ({
  listProjectFilesAction: (...args: unknown[]) => mockListProjectFilesAction(...args),
}));

function createDocxExport(id: string, projectId: string, createdAt: string): FileAsset {
  return {
    id,
    projectId,
    kind: "export",
    format: "docx",
    filename: `${id}.docx`,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 10,
    downloadUrl: `https://example.com/${id}.docx`,
    version: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

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
          downloadUrl: "https://example.com/docx-1.docx",
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
          downloadUrl: "https://example.com/md-1.md",
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

  it("clears visible history immediately when the project changes until the new load completes", async () => {
    mockListProjectFilesAction
      .mockResolvedValueOnce({
        success: true,
        data: [
          createDocxExport("docx-1", "proj-1", "2026-03-21T12:00:00.000Z"),
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [
          createDocxExport("docx-2", "proj-2", "2026-03-21T13:00:00.000Z"),
        ],
      });

    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectExportHistory(projectId),
      { initialProps: { projectId: "proj-1" } },
    );

    await waitFor(() => {
      expect(result.current.latestExport?.id).toBe("docx-1");
    });

    rerender({ projectId: "proj-2" });

    expect(result.current.exportHistory).toEqual([]);
    expect(result.current.latestExport).toBeNull();

    await waitFor(() => {
      expect(result.current.latestExport?.id).toBe("docx-2");
    });
  });

  it("ignores stale loads after the project changes", async () => {
    let resolveFirstLoad: ((value: { success: true; data: FileAsset[] }) => void) | null = null;
    let resolveSecondLoad: ((value: { success: true; data: FileAsset[] }) => void) | null = null;

    mockListProjectFilesAction
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstLoad = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondLoad = resolve;
          }),
      );

    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectExportHistory(projectId),
      { initialProps: { projectId: "proj-1" } },
    );

    rerender({ projectId: "proj-2" });

    await act(async () => {
      resolveSecondLoad?.({
        success: true,
        data: [createDocxExport("docx-2", "proj-2", "2026-03-21T13:00:00.000Z")],
      });
    });

    await waitFor(() => {
      expect(result.current.latestExport?.id).toBe("docx-2");
    });

    await act(async () => {
      resolveFirstLoad?.({
        success: true,
        data: [createDocxExport("docx-1", "proj-1", "2026-03-21T12:00:00.000Z")],
      });
    });

    expect(result.current.exportHistory).toHaveLength(1);
    expect(result.current.latestExport?.id).toBe("docx-2");
  });
});
