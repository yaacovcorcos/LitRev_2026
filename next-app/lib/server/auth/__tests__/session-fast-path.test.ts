import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  getSession: vi.fn(),
  findFirstMembership: vi.fn(),
  upsertWorkspace: vi.fn(),
  upsertMembership: vi.fn(),
  claimLegacySingleUserData: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: mocks.getSession,
    },
  }),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    workspaceMember: {
      findFirst: mocks.findFirstMembership,
      upsert: mocks.upsertMembership,
    },
    workspace: {
      upsert: mocks.upsertWorkspace,
    },
  },
}));

vi.mock("@/lib/server/auth/claim", () => ({
  claimLegacySingleUserData: mocks.claimLegacySingleUserData,
}));

describe("session fast auth path", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.headers.mockReset();
    mocks.getSession.mockReset();
    mocks.findFirstMembership.mockReset();
    mocks.upsertWorkspace.mockReset();
    mocks.upsertMembership.mockReset();
    mocks.claimLegacySingleUserData.mockReset();

    mocks.headers.mockResolvedValue(new Headers());
    mocks.getSession.mockResolvedValue({
      user: {
        id: "user-fast-1",
        name: "Alex Doe",
      },
    });
    mocks.findFirstMembership.mockResolvedValue({
      workspaceId: "workspace-user-fast-1",
      userId: "user-fast-1",
      role: "owner",
    });
    mocks.upsertWorkspace.mockResolvedValue(null);
    mocks.upsertMembership.mockResolvedValue({
      workspaceId: "workspace-user-fast-1",
      userId: "user-fast-1",
      role: "owner",
    });
    mocks.claimLegacySingleUserData.mockResolvedValue({
      claimed: false,
      movedProjects: 0,
      movedConversations: 0,
      movedUsageRows: 0,
      movedUserMemories: 0,
      backfilledStudies: 0,
      backfilledFiles: 0,
    });
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns fast auth context without running legacy claim", async () => {
    const { getOptionalFastAuthSessionContext } = await import("@/lib/server/auth/session");

    const result = await getOptionalFastAuthSessionContext();

    expect(result).toMatchObject({
      context: {
        userId: "user-fast-1",
        workspaceId: "workspace-user-fast-1",
        role: "owner",
      },
      sessionUser: {
        id: "user-fast-1",
        name: "Alex Doe",
      },
    });
    expect(mocks.claimLegacySingleUserData).not.toHaveBeenCalled();
  });

  it("keeps legacy claim on the regular auth path", async () => {
    const { getAuthContext } = await import("@/lib/server/auth/session");

    const result = await getAuthContext();

    expect(result).toMatchObject({
      userId: "user-fast-1",
      workspaceId: "workspace-user-fast-1",
      role: "owner",
    });
    expect(mocks.claimLegacySingleUserData).toHaveBeenCalledWith({
      userId: "user-fast-1",
      workspaceId: "workspace-user-fast-1",
    });
  });
});
