import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateNoteTool } from "@/lib/server/ai/tools/update-note";

const mockGetDraft = vi.fn();

vi.mock("@/lib/server/drafts", () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
}));

function buildDoc(text: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

describe("updateNoteTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDraft.mockResolvedValue(null);
  });

  it("requires project context", async () => {
    const result = await updateNoteTool.execute({
      section: "Introduction",
      content: "New paragraph",
      action: "replace",
    });

    expect(result.error).toContain("No project context available");
  });

  it("returns deterministic section metadata and base state for replace proposals", async () => {
    mockGetDraft.mockResolvedValueOnce({
      contentBySection: {
        introduction: buildDoc("Existing draft text"),
      },
    });

    const result = await updateNoteTool.execute(
      {
        section: "Introduction",
        content: "New paragraph",
        action: "replace",
      },
      { projectId: "proj-1" },
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      section: "Introduction",
      sectionKey: "introduction",
      content: "New paragraph",
      citations: [],
      wordCount: 2,
      baseSectionContent: buildDoc("Existing draft text"),
    });
  });

  it("appends against the current section text while preserving the original base snapshot", async () => {
    const existingDoc = buildDoc("Existing draft text");
    mockGetDraft.mockResolvedValueOnce({
      contentBySection: {
        introduction: existingDoc,
      },
    });

    const result = await updateNoteTool.execute(
      {
        section: "Introduction",
        content: "Added paragraph",
        action: "append",
      },
      { projectId: "proj-1" },
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      section: "Introduction",
      sectionKey: "introduction",
      content: "Existing draft text\n\nAdded paragraph",
      citations: [],
      wordCount: 5,
      baseSectionContent: existingDoc,
    });
  });
});
