import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudyDuplicateCluster } from "@/lib/server/search/dedup";

const mockStudyFindFirst = vi.fn();
const mockStudyFindMany = vi.fn();
const mockStudyUpdate = vi.fn();
const mockStudyUpdateMany = vi.fn();
const mockFileAssetFindMany = vi.fn();
const mockFileAssetUpdateMany = vi.fn();
const mockStudyMemoryUpdateMany = vi.fn();
const mockMemoryEmbeddingUpdateMany = vi.fn();
const mockNoteUpdateMany = vi.fn();
const mockConversationUpdateMany = vi.fn();
const mockDraftFindUnique = vi.fn();
const mockDraftUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: vi.fn(async () => ({ workspaceId: "ws-1" })),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    study: {
      findFirst: (...args: unknown[]) => mockStudyFindFirst(...args),
      findMany: (...args: unknown[]) => mockStudyFindMany(...args),
      update: (...args: unknown[]) => mockStudyUpdate(...args),
      updateMany: (...args: unknown[]) => mockStudyUpdateMany(...args),
    },
    fileAsset: {
      findMany: (...args: unknown[]) => mockFileAssetFindMany(...args),
      updateMany: (...args: unknown[]) => mockFileAssetUpdateMany(...args),
    },
    studyMemory: {
      updateMany: (...args: unknown[]) => mockStudyMemoryUpdateMany(...args),
    },
    memoryEmbedding: {
      updateMany: (...args: unknown[]) => mockMemoryEmbeddingUpdateMany(...args),
    },
    note: {
      updateMany: (...args: unknown[]) => mockNoteUpdateMany(...args),
    },
    aIConversation: {
      updateMany: (...args: unknown[]) => mockConversationUpdateMany(...args),
    },
    draft: {
      findUnique: (...args: unknown[]) => mockDraftFindUnique(...args),
      update: (...args: unknown[]) => mockDraftUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import {
  mergeStudyDuplicateCluster,
  resolveCanonicalStudyId,
} from "@/lib/server/ledger";

const SCOPE = { ownerId: "user-1", workspaceId: "ws-1" };
const PROJECT_ID = "project-1";

describe("ledger dedupe v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback: (tx: any) => unknown) =>
      callback({
        study: {
          findMany: mockStudyFindMany,
          update: mockStudyUpdate,
        },
        fileAsset: {
          findMany: mockFileAssetFindMany,
          updateMany: mockFileAssetUpdateMany,
        },
        studyMemory: { updateMany: mockStudyMemoryUpdateMany },
        memoryEmbedding: { updateMany: mockMemoryEmbeddingUpdateMany },
        note: { updateMany: mockNoteUpdateMany },
        aIConversation: { updateMany: mockConversationUpdateMany },
        draft: { findUnique: mockDraftFindUnique, update: mockDraftUpdate },
      }),
    );
  });

  it("resolveCanonicalStudyId follows mergedInto chain", async () => {
    mockStudyFindFirst
      .mockResolvedValueOnce({
        id: "study-old",
        deletedAt: new Date("2026-03-01T00:00:00.000Z"),
        details: { mergedIntoStudyId: "study-new" },
      })
      .mockResolvedValueOnce({
        id: "study-new",
        deletedAt: null,
        details: {},
      });

    const resolved = await resolveCanonicalStudyId(SCOPE, PROJECT_ID, "study-old");
    expect(resolved).toBe("study-new");
  });

  it("mergeStudyDuplicateCluster repoints dependents and rewrites draft citations", async () => {
    const cluster: StudyDuplicateCluster = {
      studyIds: ["study-a", "study-b"],
      confidence: "high",
      signals: ["doi"],
      pairs: [
        {
          leftStudyId: "study-a",
          rightStudyId: "study-b",
          confidence: "high",
          signals: ["doi"],
        },
      ],
    };

    mockStudyFindMany.mockResolvedValueOnce([
      {
        id: "study-a",
        title: "A",
        authors: "Smith J",
        year: 2024,
        status: "active",
        quality: "High",
        details: { doi: "10.1/a" },
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      {
        id: "study-b",
        title: "B",
        authors: "Smith J",
        year: 2024,
        status: "pending",
        quality: "-",
        details: { doi: "10.1/a", abstract: "Longer abstract" },
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ]);
    mockFileAssetFindMany.mockResolvedValue([{ studyId: "study-b" }]);
    mockDraftFindUnique.mockResolvedValue({
      projectId: PROJECT_ID,
      state: {
        contentBySection: {
          abstract: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "citation", attrs: { studyId: "study-b", uid: "u1" } }],
              },
            ],
          },
        },
      },
    });
    mockStudyUpdate.mockResolvedValue({});
    mockFileAssetUpdateMany.mockResolvedValue({ count: 1 });
    mockStudyMemoryUpdateMany.mockResolvedValue({ count: 0 });
    mockMemoryEmbeddingUpdateMany.mockResolvedValue({ count: 0 });
    mockNoteUpdateMany.mockResolvedValue({ count: 0 });
    mockConversationUpdateMany.mockResolvedValue({ count: 0 });
    mockDraftUpdate.mockResolvedValue({});

    const result = await mergeStudyDuplicateCluster(SCOPE, PROJECT_ID, cluster);

    expect(result.merged).toBe(true);
    expect(result.canonicalStudyId).toBe("study-a");
    expect(result.mergedStudyIds).toEqual(["study-b"]);
    expect(mockFileAssetUpdateMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, studyId: { in: ["study-b"] } },
      data: { studyId: "study-a" },
    });
    expect(mockDraftUpdate).toHaveBeenCalledTimes(1);
    const draftUpdatePayload = mockDraftUpdate.mock.calls[0][0].data.state;
    const rewrittenCitation =
      draftUpdatePayload.contentBySection.abstract.content[0].content[0].attrs.studyId;
    expect(rewrittenCitation).toBe("study-a");
    const rewrittenManuscriptCitation =
      draftUpdatePayload.manuscript.doc.content[0].content[0].content[0].attrs.studyId;
    expect(rewrittenManuscriptCitation).toBe("study-a");
  });
});
