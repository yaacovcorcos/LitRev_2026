import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserMemoryFindUnique = vi.fn();
const mockUserMemoryUpsert = vi.fn();
const mockProjectFindUnique = vi.fn();
const mockProjectUpdate = vi.fn();
const mockAssertProjectAccess = vi.fn();

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    userMemory: {
      findUnique: (...args: unknown[]) => mockUserMemoryFindUnique(...args),
      upsert: (...args: unknown[]) => mockUserMemoryUpsert(...args),
    },
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
      update: (...args: unknown[]) => mockProjectUpdate(...args),
    },
  },
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAssertProjectAccess(...args),
}));

import {
  getGuidedSetupDefault,
  getProjectOnboardingState,
  setGuidedSetupDefault,
  setProjectOnboardingState,
  shouldLaunchGuidedSetupForProject,
} from "../onboarding";

const SCOPE = { ownerId: "user-1", workspaceId: "ws-1" };
const PROJECT_ID = "project-1";

describe("onboarding service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertProjectAccess.mockResolvedValue(SCOPE);
    mockProjectFindUnique.mockResolvedValue({ progress: null });
  });

  it("defaults guided setup to enabled when no preference exists", async () => {
    mockUserMemoryFindUnique.mockResolvedValue(null);

    const enabled = await getGuidedSetupDefault(SCOPE);

    expect(enabled).toBe(true);
    expect(mockUserMemoryFindUnique).toHaveBeenCalledWith({
      where: {
        userId_key: {
          userId: "user-1",
          key: "guided_setup_new_projects",
        },
      },
      select: { value: true },
    });
  });

  it("returns disabled guided setup when preference is 0", async () => {
    mockUserMemoryFindUnique.mockResolvedValue({ value: "0" });

    const enabled = await getGuidedSetupDefault(SCOPE);

    expect(enabled).toBe(false);
  });

  it("persists guided setup default in user memory", async () => {
    mockUserMemoryUpsert.mockResolvedValue({});

    const result = await setGuidedSetupDefault(SCOPE, false);

    expect(result).toBe(false);
    expect(mockUserMemoryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_key: {
            userId: "user-1",
            key: "guided_setup_new_projects",
          },
        },
        create: expect.objectContaining({
          userId: "user-1",
          value: "0",
          type: "preference",
        }),
        update: expect.objectContaining({
          value: "0",
          status: "active",
        }),
      })
    );
  });

  it("parses per-project onboarding state from project progress", async () => {
    mockProjectFindUnique.mockResolvedValue({
      progress: {
        other: "data",
        onboarding: {
          enabledOverride: false,
          completedAt: "2026-02-20T12:00:00.000Z",
          skippedAt: "2026-02-20T12:00:00.000Z",
        },
      },
    });

    const state = await getProjectOnboardingState(SCOPE, PROJECT_ID);

    expect(state).toEqual({
      enabledOverride: false,
      completedAt: "2026-02-20T12:00:00.000Z",
      skippedAt: "2026-02-20T12:00:00.000Z",
    });
    expect(mockAssertProjectAccess).toHaveBeenCalledWith(SCOPE, PROJECT_ID);
  });

  it("merges onboarding updates without removing other progress data", async () => {
    mockProjectFindUnique.mockResolvedValue({
      progress: {
        protocol: { completion: 0.5 },
        onboarding: {
          enabledOverride: null,
          completedAt: null,
          skippedAt: null,
        },
      },
    });
    mockProjectUpdate.mockResolvedValue({
      progress: {
        protocol: { completion: 0.5 },
        onboarding: {
          enabledOverride: true,
          completedAt: null,
          skippedAt: null,
        },
      },
    });

    const state = await setProjectOnboardingState(SCOPE, PROJECT_ID, { enabledOverride: true });

    expect(state).toEqual({
      enabledOverride: true,
      completedAt: null,
      skippedAt: null,
    });
    expect(mockProjectUpdate).toHaveBeenCalledWith({
      where: { id: PROJECT_ID },
      data: {
        progress: {
          protocol: { completion: 0.5 },
          onboarding: {
            enabledOverride: true,
            completedAt: null,
            skippedAt: null,
          },
        },
      },
      select: { progress: true },
    });
  });

  it("does not launch guided setup when project onboarding is completed", async () => {
    mockUserMemoryFindUnique.mockResolvedValue({ value: "1" });
    mockProjectFindUnique.mockResolvedValue({
      progress: {
        onboarding: {
          enabledOverride: null,
          completedAt: "2026-02-21T10:00:00.000Z",
          skippedAt: null,
        },
      },
    });

    const shouldLaunch = await shouldLaunchGuidedSetupForProject(SCOPE, PROJECT_ID);

    expect(shouldLaunch).toBe(false);
  });

  it("uses project override before global default when deciding launch behavior", async () => {
    mockUserMemoryFindUnique.mockResolvedValue({ value: "1" });
    mockProjectFindUnique.mockResolvedValue({
      progress: {
        onboarding: {
          enabledOverride: false,
          completedAt: null,
          skippedAt: null,
        },
      },
    });

    const shouldLaunch = await shouldLaunchGuidedSetupForProject(SCOPE, PROJECT_ID);

    expect(shouldLaunch).toBe(false);
  });
});
