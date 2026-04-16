import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDraftCheckpointSnapshot } from "@/lib/draft-checkpoints";
import { normalizeDraftState, type DraftStateInput } from "@/lib/draft-storage";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";

const mockAssertProjectAccess = vi.fn();
const mockDraftCheckpointCreate = vi.fn();
const mockDraftCheckpointFindMany = vi.fn();
const mockDraftCheckpointFindFirst = vi.fn();
const mockFileAssetFindFirst = vi.fn();
const mockArtifactFindFirst = vi.fn();
const mockConversationFindFirst = vi.fn();
const mockGetDraft = vi.fn();
const mockSaveDraft = vi.fn();

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAssertProjectAccess(...args),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    draftCheckpoint: {
      create: (...args: unknown[]) => mockDraftCheckpointCreate(...args),
      findMany: (...args: unknown[]) => mockDraftCheckpointFindMany(...args),
      findFirst: (...args: unknown[]) => mockDraftCheckpointFindFirst(...args),
    },
    fileAsset: {
      findFirst: (...args: unknown[]) => mockFileAssetFindFirst(...args),
    },
    artifact: {
      findFirst: (...args: unknown[]) => mockArtifactFindFirst(...args),
    },
    aIConversation: {
      findFirst: (...args: unknown[]) => mockConversationFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/server/drafts", () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
}));

import {
  compareDraftCheckpoint,
  createDraftCheckpoint,
  getDraftCheckpoint,
  listDraftCheckpoints,
  restoreDraftCheckpoint,
} from "@/lib/server/draft-checkpoints";

const scope = { ownerId: "user-1", workspaceId: "ws-1" };

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

function createDraftState(options?: {
  mode?: "section" | "full";
  activeSection?: string | null;
  includeDiscussion?: boolean;
  abstractText?: string;
  discussionText?: string;
  copilotText?: string;
}): DraftStateInput {
  const includeDiscussion = options?.includeDiscussion ?? false;
  const sectionOrder = includeDiscussion ? ["abstract", "discussion", "references"] : ["abstract", "references"];
  const manuscriptSections = [
    {
      sectionId: "abstract",
      sectionNodeId: "sec:abstract",
      kind: "base" as const,
      label: "Abstract",
    },
    ...(includeDiscussion
      ? [
          {
            sectionId: "discussion",
            sectionNodeId: "sec:discussion",
            kind: "base" as const,
            label: "Discussion",
          },
        ]
      : []),
    {
      sectionId: "references",
      sectionNodeId: "sec:references",
      kind: "base" as const,
      label: "References",
    },
  ];

  return normalizeDraftState({
    version: 2,
    mode: options?.mode ?? "section",
    activeSection: options?.activeSection ?? "abstract",
    sectionOrder,
    customSections: {},
    formattingBySection: {
      [UNSECTIONED_DRAFT_ID]: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      abstract: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      discussion: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
      references: { fontSize: 16, lineHeight: 1.8, paragraphSpacing: 12, fontFamily: "Georgia" },
    },
    panels: {
      ledgerWidth: 480,
      copilotWidth: 520,
      ledgerCollapsed: true,
      copilotCollapsed: false,
    },
    contentBySection: {
      [UNSECTIONED_DRAFT_ID]: buildDoc(""),
      abstract: buildDoc(options?.abstractText ?? "Abstract draft text"),
      discussion: buildDoc(options?.discussionText ?? "Discussion draft text"),
      references: buildDoc(""),
    },
    ledgerBySection: {
      [UNSECTIONED_DRAFT_ID]: [],
      abstract: ["study-1"],
      discussion: ["study-2"],
      references: [],
    },
    copilotBySection: {
      [UNSECTIONED_DRAFT_ID]: [],
      abstract: options?.copilotText
        ? [{ id: "m-1", sender: "ai" as const, text: options.copilotText, createdAt: "2026-03-21T00:00:00.000Z" }]
        : [],
      discussion: [],
      references: [],
    },
    manuscript: {
      schemaVersion: 2 as const,
      doc: { type: "doc", content: [] },
      sections: manuscriptSections,
    },
  });
}

describe("draft-checkpoints service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertProjectAccess.mockResolvedValue(scope);
    mockFileAssetFindFirst.mockResolvedValue(null);
    mockArtifactFindFirst.mockResolvedValue(null);
    mockConversationFindFirst.mockResolvedValue(null);
    mockGetDraft.mockResolvedValue(null);
    mockSaveDraft.mockImplementation(async (_scopeInput, _projectId, state) => normalizeDraftState(state));
    mockDraftCheckpointCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "checkpoint-1",
      projectId: "proj-1",
      workspaceId: data.workspaceId ?? "ws-1",
      label: data.label ?? null,
      kind: data.kind ?? "manual",
      snapshot: data.snapshot,
      fileAssetId: data.fileAssetId ?? null,
      artifactId: data.artifactId ?? null,
      conversationId: data.conversationId ?? null,
      createdAt: new Date("2026-03-21T12:00:00.000Z"),
    }));
  });

  it("creates an immutable authoring-state snapshot and trims link metadata", async () => {
    mockFileAssetFindFirst.mockResolvedValueOnce({ id: "file-1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv-1" });
    const draft = createDraftState({ includeDiscussion: true, copilotText: "Preserve this separately" });

    const checkpoint = await createDraftCheckpoint(scope, {
      projectId: "proj-1",
      label: "  Milestone A  ",
      kind: "manual",
      draftState: draft,
      fileAssetId: "file-1",
      conversationId: "conv-1",
    });

    const createInput = mockDraftCheckpointCreate.mock.calls[0]?.[0]?.data;
    expect(createInput.workspaceId).toBe("ws-1");
    expect(createInput.label).toBe("Milestone A");
    expect(createInput.fileAssetId).toBe("file-1");
    expect(createInput.snapshot).toEqual(
      expect.objectContaining({
        manuscript: expect.any(Object),
        sectionOrder: ["abstract", "discussion", "references"],
        customSections: {},
      }),
    );
    expect(createInput.snapshot).not.toHaveProperty("mode");
    expect(createInput.snapshot).not.toHaveProperty("activeSection");
    expect(createInput.snapshot).not.toHaveProperty("panels");
    expect(createInput.snapshot).not.toHaveProperty("contentBySection");
    expect(createInput.snapshot).not.toHaveProperty("copilotBySection");
    expect(checkpoint.fileAssetId).toBe("file-1");
    expect(mockConversationFindFirst).toHaveBeenCalledWith({
      where: {
        id: "conv-1",
        projectId: "proj-1",
        userId: "user-1",
        workspaceId: "ws-1",
      },
      select: { id: true },
    });
  });

  it("lists and loads checkpoints as normalized records", async () => {
    const snapshot = buildDraftCheckpointSnapshot(createDraftState({ includeDiscussion: true }));
    const record = {
      id: "checkpoint-1",
      projectId: "proj-1",
      workspaceId: "ws-1",
      label: "Draft export",
      kind: "export",
      snapshot,
      fileAssetId: "file-1",
      artifactId: null,
      conversationId: null,
      createdAt: new Date("2026-03-21T12:00:00.000Z"),
    };
    mockDraftCheckpointFindMany.mockResolvedValueOnce([record]);
    mockDraftCheckpointFindFirst.mockResolvedValueOnce(record);

    const list = await listDraftCheckpoints(scope, "proj-1");
    const single = await getDraftCheckpoint(scope, "proj-1", "checkpoint-1");

    expect(list).toHaveLength(1);
    expect(list[0]?.kind).toBe("export");
    expect(single.id).toBe("checkpoint-1");
    expect(single.snapshot.sectionOrder).toEqual(["abstract", "discussion", "references"]);
  });

  it("compares checkpoint authoring state against the current draft", async () => {
    const currentDraft = createDraftState({
      includeDiscussion: false,
      abstractText: "Current abstract text",
    });
    const checkpointSnapshot = buildDraftCheckpointSnapshot(
      createDraftState({
        includeDiscussion: true,
        abstractText: "Checkpoint abstract text with more words",
        discussionText: "New discussion section",
      }),
    );

    mockGetDraft.mockResolvedValueOnce(currentDraft);
    mockDraftCheckpointFindFirst.mockResolvedValueOnce({
      id: "checkpoint-2",
      projectId: "proj-1",
      workspaceId: "ws-1",
      label: "Checkpoint",
      kind: "manual",
      snapshot: checkpointSnapshot,
      fileAssetId: null,
      artifactId: null,
      conversationId: null,
      createdAt: new Date("2026-03-21T12:00:00.000Z"),
    });

    const comparison = await compareDraftCheckpoint(scope, "proj-1", "checkpoint-2");

    expect(comparison.checkpointId).toBe("checkpoint-2");
    expect(comparison.addedSectionIds).toEqual(["discussion"]);
    expect(comparison.removedSectionIds).toEqual([]);
    expect(comparison.changedSectionIds).toEqual(["abstract"]);
    expect(comparison.sectionDeltas[0]).toEqual(
      expect.objectContaining({
        sectionId: "abstract",
      }),
    );
  });

  it("restores checkpoint authoring state while preserving current non-authoring fields", async () => {
    const currentDraft = createDraftState({
      mode: "full",
      activeSection: "abstract",
      includeDiscussion: false,
      abstractText: "Current abstract",
      copilotText: "Keep this copilot thread",
    });
    const checkpointSnapshot = buildDraftCheckpointSnapshot(
      createDraftState({
        includeDiscussion: true,
        abstractText: "Checkpoint abstract text",
        discussionText: "Checkpoint discussion text",
      }),
    );

    mockGetDraft.mockResolvedValueOnce(currentDraft);
    mockDraftCheckpointFindFirst.mockResolvedValueOnce({
      id: "checkpoint-3",
      projectId: "proj-1",
      workspaceId: "ws-1",
      label: "Restore me",
      kind: "manual",
      snapshot: checkpointSnapshot,
      fileAssetId: null,
      artifactId: null,
      conversationId: null,
      createdAt: new Date("2026-03-21T12:00:00.000Z"),
    });

    const restored = await restoreDraftCheckpoint(scope, "proj-1", "checkpoint-3");

    const restoredDraftArg = mockSaveDraft.mock.calls[0]?.[2];
    expect(restoredDraftArg.mode).toBe("full");
    expect(restoredDraftArg.activeSection).toBe("abstract");
    expect(restoredDraftArg.panels).toEqual(currentDraft.panels);
    expect(restoredDraftArg.copilotBySection.abstract).toEqual(currentDraft.copilotBySection.abstract);
    expect(JSON.stringify(restoredDraftArg.contentBySection.abstract)).toContain("Checkpoint abstract text");
    expect(JSON.stringify(restoredDraftArg.contentBySection.abstract)).not.toContain("Current abstract");
    expect(restored.draft.sectionOrder).toEqual(["abstract", "discussion", "references"]);
    expect(restored.checkpoint.id).toBe("checkpoint-3");
  });
});
