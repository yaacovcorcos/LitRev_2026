// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Study } from "@/types/ledger";
import {
  useLedgerActions,
  type LedgerConfirmDialogState,
} from "../useLedgerActions";

function makeStudy(id: string, overrides: Partial<Study> = {}): Study {
  return {
    id,
    title: `Study ${id}`,
    authors: "Doe",
    year: 2024,
    status: "pending",
    quality: "-",
    details: {},
    ...overrides,
  };
}

describe("useLedgerActions", () => {
  it("handles selection mode and select-all state transitions", () => {
    const studies = [makeStudy("s1"), makeStudy("s2")];
    const removeStudies = vi.fn(async () => {});
    const upsertNewStudy = vi.fn(async (...[, study]: [string, Study]) => study);
    const updateSingleStudy = vi.fn(async () => studies[0]);
    const setAlertMsg = vi.fn();
    const setConfirmDialog = vi.fn();

    const { result } = renderHook(() =>
      useLedgerActions({
        projectId: "project-1",
        studies,
        removeStudies,
        upsertNewStudy,
        updateSingleStudy,
        setAlertMsg,
        setConfirmDialog,
      }),
    );

    expect(result.current.isSelectMode).toBe(false);
    expect(result.current.hasSelection).toBe(false);

    act(() => {
      result.current.toggleSelectMode();
    });
    expect(result.current.isSelectMode).toBe(true);

    act(() => {
      result.current.toggleSelectAll();
    });
    expect(result.current.hasSelection).toBe(true);
    expect(result.current.allSelected).toBe(true);
    expect(result.current.validSelectedIds).toEqual(["s1", "s2"]);

    act(() => {
      result.current.toggleStudySelection("s1");
    });
    expect(result.current.allSelected).toBe(false);
    expect(result.current.validSelectedIds).toEqual(["s2"]);

    act(() => {
      result.current.toggleSelectMode();
    });
    expect(result.current.isSelectMode).toBe(false);
    expect(result.current.hasSelection).toBe(false);
  });

  it("adds a new study with trimmed values and resets form state", async () => {
    const studies = [makeStudy("s1")];
    const removeStudies = vi.fn(async () => {});
    const upsertNewStudy = vi.fn(async (...[, study]: [string, Study]) => study);
    const updateSingleStudy = vi.fn(async () => studies[0]);
    const setAlertMsg = vi.fn();
    const setConfirmDialog = vi.fn();

    const { result } = renderHook(() =>
      useLedgerActions({
        projectId: "project-1",
        studies,
        removeStudies,
        upsertNewStudy,
        updateSingleStudy,
        setAlertMsg,
        setConfirmDialog,
      }),
    );

    act(() => {
      result.current.setIsAdding(true);
      result.current.setNewStudy({
        title: "  New Title  ",
        authors: "  Jane Doe  ",
        year: "2022",
        status: "extracted",
        quality: "High",
      });
    });

    await act(async () => {
      await result.current.handleAddStudy();
    });

    expect(upsertNewStudy).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        id: expect.any(String),
        title: "New Title",
        authors: "Jane Doe",
        year: 2022,
        status: "extracted",
        quality: "High",
      }),
    );
    expect(result.current.isAdding).toBe(false);
    expect(result.current.newStudy.title).toBe("");
    expect(result.current.newStudy.authors).toBe("");
    expect(result.current.newStudy.status).toBe("pending");
    expect(result.current.newStudy.quality).toBe("-");
    expect(Number(result.current.newStudy.year)).toBeGreaterThan(2000);
  });

  it("opens delete confirmation and executes delete on confirm", async () => {
    const studies = [makeStudy("s1")];
    const removeStudies = vi.fn(async () => {});
    const upsertNewStudy = vi.fn(async (...[, study]: [string, Study]) => study);
    const updateSingleStudy = vi.fn(async () => studies[0]);
    const setAlertMsg = vi.fn();
    const setConfirmDialog = vi.fn();

    const { result } = renderHook(() =>
      useLedgerActions({
        projectId: "project-1",
        studies,
        removeStudies,
        upsertNewStudy,
        updateSingleStudy,
        setAlertMsg,
        setConfirmDialog,
      }),
    );

    act(() => {
      result.current.handleDeleteStudy("s1");
    });

    const dialogArg = setConfirmDialog.mock.calls[0][0] as Exclude<
      LedgerConfirmDialogState,
      null
    >;
    expect(dialogArg.message).toContain("Delete this study");

    await act(async () => {
      dialogArg.onConfirm();
      await Promise.resolve();
    });

    expect(removeStudies).toHaveBeenCalledWith("project-1", ["s1"]);
    expect(setConfirmDialog).toHaveBeenCalledWith(null);
  });

  it("shows alert when delete confirm action fails", async () => {
    const studies = [makeStudy("s1")];
    const removeStudies = vi.fn(async () => {
      throw new Error("boom");
    });
    const upsertNewStudy = vi.fn(async (...[, study]: [string, Study]) => study);
    const updateSingleStudy = vi.fn(async () => studies[0]);
    const setAlertMsg = vi.fn();
    const setConfirmDialog = vi.fn();

    const { result } = renderHook(() =>
      useLedgerActions({
        projectId: "project-1",
        studies,
        removeStudies,
        upsertNewStudy,
        updateSingleStudy,
        setAlertMsg,
        setConfirmDialog,
      }),
    );

    act(() => {
      result.current.handleDeleteStudy("s1");
    });

    const dialogArg = setConfirmDialog.mock.calls[0][0] as Exclude<
      LedgerConfirmDialogState,
      null
    >;

    await act(async () => {
      dialogArg.onConfirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setAlertMsg).toHaveBeenCalledWith(
      "Failed to delete study. Please try again.",
    );
  });

  it("handles bulk delete and triage updates", async () => {
    const studies = [
      makeStudy("s1", { details: { journal: "JAMA" } }),
      makeStudy("s2"),
    ];
    const removeStudies = vi.fn(async () => {});
    const upsertNewStudy = vi.fn(async (...[, study]: [string, Study]) => study);
    const updateSingleStudy = vi.fn(async () => studies[0]);
    const setAlertMsg = vi.fn();
    const setConfirmDialog = vi.fn();

    const { result } = renderHook(() =>
      useLedgerActions({
        projectId: "project-1",
        studies,
        removeStudies,
        upsertNewStudy,
        updateSingleStudy,
        setAlertMsg,
        setConfirmDialog,
      }),
    );

    act(() => {
      result.current.toggleStudySelection("s1");
      result.current.toggleStudySelection("s2");
    });
    expect(result.current.hasSelection).toBe(true);

    act(() => {
      result.current.handleBulkDelete();
    });

    const dialogArg = setConfirmDialog.mock.calls[0][0] as Exclude<
      LedgerConfirmDialogState,
      null
    >;
    expect(dialogArg.message).toContain("2 selected studies");

    await act(async () => {
      dialogArg.onConfirm();
      await Promise.resolve();
    });

    expect(removeStudies).toHaveBeenCalledWith("project-1", ["s1", "s2"]);
    expect(result.current.hasSelection).toBe(false);

    await act(async () => {
      await result.current.handleTriage("s1", "keep");
    });

    expect(updateSingleStudy).toHaveBeenCalledWith(
      "project-1",
      "s1",
      expect.objectContaining({
        details: expect.objectContaining({
          journal: "JAMA",
          triageDecision: "keep",
          triageDate: expect.any(String),
        }),
      }),
    );
  });

  it("creates quick-add study entries", async () => {
    const studies = [makeStudy("s1")];
    const removeStudies = vi.fn(async () => {});
    const upsertNewStudy = vi.fn(async (...[, study]: [string, Study]) => study);
    const updateSingleStudy = vi.fn(async () => studies[0]);
    const setAlertMsg = vi.fn();
    const setConfirmDialog = vi.fn();

    const { result } = renderHook(() =>
      useLedgerActions({
        projectId: "project-1",
        studies,
        removeStudies,
        upsertNewStudy,
        updateSingleStudy,
        setAlertMsg,
        setConfirmDialog,
      }),
    );

    await act(async () => {
      await result.current.handleQuickAddStudy();
    });

    expect(upsertNewStudy).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        id: expect.any(String),
        title: "New Study",
        authors: "",
        status: "pending",
        quality: "-",
      }),
    );
  });
});
