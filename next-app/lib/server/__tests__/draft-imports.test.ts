import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDraftState } from "@/lib/draft-storage";
import type { Study } from "@/types/ledger";

const mockGetDraft = vi.fn();
const mockSaveDraft = vi.fn();
const mockListStudies = vi.fn();
const mockCreateDraftCheckpoint = vi.fn();

vi.mock("@/lib/server/drafts", () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
}));

vi.mock("@/lib/server/ledger", () => ({
  listStudies: (...args: unknown[]) => mockListStudies(...args),
}));

vi.mock("@/lib/server/draft-checkpoints", () => ({
  createDraftCheckpoint: (...args: unknown[]) => mockCreateDraftCheckpoint(...args),
}));

import { executeDraftImport } from "@/lib/server/draft-imports";

const scope = { ownerId: "user-1", workspaceId: "ws-1" };
const studies: Study[] = [
  {
    id: "study-1",
    title: "Synthetic Outcomes After Timed Intensification",
    authors: "Smith, Jane",
    year: 2020,
    status: "active",
    quality: "High",
    details: { doi: "10.1000/litrev-benchmark-1" },
  },
];

describe("executeDraftImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDraft.mockResolvedValue(createDefaultDraftState());
    mockSaveDraft.mockImplementation(async (_scope, _projectId, nextDraft) => nextDraft);
    mockListStudies.mockResolvedValue(studies);
    mockCreateDraftCheckpoint.mockResolvedValue({ id: "checkpoint-1", kind: "import" });
  });

  it("returns dry-run results without mutating draft state", async () => {
    const result = await executeDraftImport(scope, {
      projectId: "project-1",
      payload: {
        format: "bibtex",
        filename: "sample-references.bib",
        text: `@article{smith2020, title = {Synthetic Outcomes After Timed Intensification}, year = {2020}, doi = {10.1000/litrev-benchmark-1}}`,
      },
      mode: "dry-run",
    });

    expect(result.result.kind).toBe("bibliography");
    expect(result.applyPlan.kind).toBe("merge_bibliography");
    expect(mockCreateDraftCheckpoint).not.toHaveBeenCalled();
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  it("creates an import checkpoint and saves the next draft on apply", async () => {
    const result = await executeDraftImport(scope, {
      projectId: "project-1",
      payload: {
        format: "markdown",
        filename: "sample-manuscript.md",
        text: "# Imported\n\n## Methods\n\nImported methods.",
      },
      mode: "apply",
    });

    expect(result.checkpoint).toMatchObject({ id: "checkpoint-1", kind: "import" });
    expect(mockCreateDraftCheckpoint).toHaveBeenCalledTimes(1);
    expect(mockSaveDraft).toHaveBeenCalledTimes(1);
    expect(result.draft?.sectionOrder).toEqual(["methods"]);
  });
});
