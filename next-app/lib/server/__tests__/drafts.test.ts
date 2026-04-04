import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDraftState } from "@/lib/draft-storage";

const mockDraftFindUnique = vi.fn();
const mockDraftUpsert = vi.fn();
const mockAssertProjectAccess = vi.fn();

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    draft: {
      findUnique: (...args: unknown[]) => mockDraftFindUnique(...args),
      upsert: (...args: unknown[]) => mockDraftUpsert(...args),
    },
  },
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAssertProjectAccess(...args),
}));

import { getDraft, saveDraft } from "../drafts";

const SCOPE = { ownerId: "user-1", workspaceId: "ws-1" };
const PROJECT_ID = "project-1";

describe("draft service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertProjectAccess.mockResolvedValue(SCOPE);
  });

  it("returns null when no draft exists", async () => {
    mockDraftFindUnique.mockResolvedValue(null);

    const result = await getDraft(SCOPE, PROJECT_ID);

    expect(result).toBeNull();
    expect(mockDraftFindUnique).toHaveBeenCalledWith({ where: { projectId: PROJECT_ID } });
  });

  it("normalizes draft state to JSON-safe payload before upsert", async () => {
    const state = createDefaultDraftState();
    state.sectionOrder = ["abstract"];
    state.activeSection = "abstract";
    state.customSections["custom-1"] = { label: "Custom", placeholder: undefined };
    (
      state.contentBySection.abstract.content?.[0] as { attrs?: Record<string, unknown> } | undefined
    )!.attrs = {
      keep: "value",
      drop: undefined,
    };

    mockDraftUpsert.mockResolvedValue({ state });

    await saveDraft(SCOPE, PROJECT_ID, state);

    expect(mockDraftUpsert).toHaveBeenCalledTimes(1);
    const args = mockDraftUpsert.mock.calls[0]?.[0] as {
      create: { state: Record<string, unknown> };
      update: { state: Record<string, unknown> };
    };

    expect(args.create.state).toEqual(args.update.state);
    expect(args.create.state.version).toBe(2);
    expect(args.create.state.manuscript).toMatchObject({ schemaVersion: 2 });
    expect((args.create.state.customSections as Record<string, { label: string; placeholder?: string }>)["custom-1"])
      .toEqual({ label: "Custom" });
    expect(
      (
        (
          args.create.state.contentBySection as Record<
            string,
            { content?: Array<{ attrs?: Record<string, unknown> }> }
          >
        ).abstract.content?.[0]?.attrs
      ),
    ).toMatchObject({ keep: "value", blockId: expect.any(String) });
  });
});
