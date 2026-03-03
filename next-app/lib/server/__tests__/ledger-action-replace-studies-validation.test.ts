import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReplaceStudies = vi.fn();
const mockWithAuth = vi.fn(async (handler: (session: { userId: string; workspaceId: string }) => Promise<unknown>) =>
  handler({ userId: "user-1", workspaceId: "ws-1" }),
);

vi.mock("@/lib/server/ledger", () => ({
  listStudies: vi.fn(),
  listStudiesPaginated: vi.fn(),
  replaceStudies: (
    scopeInput: unknown,
    projectId: unknown,
    studies: unknown,
    options?: unknown,
  ) => mockReplaceStudies(scopeInput, projectId, studies, options),
  deleteStudy: vi.fn(),
  deleteStudies: vi.fn(),
  upsertStudy: vi.fn(),
  getStudy: vi.fn(),
  updateStudy: vi.fn(),
  addMentionedStudy: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  withAuth: (handler: (session: { userId: string; workspaceId: string }) => Promise<unknown>) =>
    mockWithAuth(handler),
}));

import { replaceStudiesAction } from "@/app/actions/ledger";

const VALID_STUDY = {
  id: "study-1",
  title: "Study A",
  authors: "Doe",
  year: 2024,
  status: "pending" as const,
  quality: "-" as const,
  details: {},
};

describe("replaceStudiesAction empty payload contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty studies when clear_all intent is not provided", async () => {
    const result = await replaceStudiesAction("project-1", []);

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ errorCode: "VALIDATION" });
    expect(mockWithAuth).not.toHaveBeenCalled();
    expect(mockReplaceStudies).not.toHaveBeenCalled();
  });

  it("rejects clear_all intent when studies payload is non-empty", async () => {
    const result = await replaceStudiesAction("project-1", [VALID_STUDY], {
      emptyBehavior: "clear_all",
    });

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ errorCode: "VALIDATION" });
    expect(mockWithAuth).not.toHaveBeenCalled();
    expect(mockReplaceStudies).not.toHaveBeenCalled();
  });

  it("forwards explicit clear_all intent for an empty payload", async () => {
    mockReplaceStudies.mockResolvedValue([]);

    const result = await replaceStudiesAction("project-1", [], {
      emptyBehavior: "clear_all",
    });

    expect(result.success).toBe(true);
    expect(mockWithAuth).toHaveBeenCalledTimes(1);
    expect(mockReplaceStudies).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1",
      [],
      { emptyBehavior: "clear_all" },
    );
  });
});
