import "server-only";

import { prisma } from "@/lib/server/prisma";
import { logServerInfo } from "@/lib/server/logging";

const LEGACY_USER_ID = "local-user";
const LEGACY_WORKSPACE_ID = "local-workspace";
const LEGACY_CLAIM_TX_TIMEOUT_MS = 15_000;

const claimedUsers = new Set<string>();

export type LegacyClaimResult = {
  claimed: boolean;
  movedProjects: number;
  movedConversations: number;
  movedUsageRows: number;
  movedUserMemories: number;
  backfilledStudies: number;
  backfilledFiles: number;
};

type LegacyClaimDebug = {
  movedRunsByProject: number;
  movedArtifactsByProject: number;
  movedNotesByProject: number;
  movedRetrievalsByProject: number;
  movedEmbeddingsByProject: number;
  movedAutonomyByProject: number;
};

type LegacyClaimInternalResult = LegacyClaimResult & {
  debug: LegacyClaimDebug;
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value && value.trim()))),
  );
}

export async function claimLegacySingleUserData(params: {
  userId: string;
  workspaceId: string;
}): Promise<LegacyClaimResult> {
  const userId = params.userId.trim();
  const workspaceId = params.workspaceId.trim();
  if (!userId || !workspaceId) {
    throw new Error("claimLegacySingleUserData requires userId and workspaceId.");
  }

  if (claimedUsers.has(userId)) {
    return {
      claimed: false,
      movedProjects: 0,
      movedConversations: 0,
      movedUsageRows: 0,
      movedUserMemories: 0,
      backfilledStudies: 0,
      backfilledFiles: 0,
    };
  }

  const result = await prisma.$transaction<LegacyClaimInternalResult>(async (tx) => {
    // Serialize claim attempts across concurrent requests/processes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7311, 2026)`;

    const [legacyUser, legacyWorkspace] = await Promise.all([
      tx.user.findUnique({
        where: { id: LEGACY_USER_ID },
        select: { id: true },
      }),
      tx.workspace.findUnique({
        where: { id: LEGACY_WORKSPACE_ID },
        select: { id: true },
      }),
    ]);

    const legacyProjects = await tx.project.findMany({
      where: {
        OR: [
          { ownerId: LEGACY_USER_ID },
          { workspaceId: LEGACY_WORKSPACE_ID },
        ],
      },
      select: { id: true },
    });

    const legacyProjectIds = legacyProjects.map((project) => project.id);
    const hasLegacyIdentity = Boolean(
      legacyUser || legacyWorkspace || legacyProjectIds.length > 0,
    );

    // Prevent unique collisions on UserMemory(userId,key) before reassigning.
    const existingKeys = await tx.userMemory.findMany({
      where: { userId },
      select: { key: true },
    });
    const occupiedKeys = existingKeys.map((row) => row.key);
    if (occupiedKeys.length > 0) {
      await tx.userMemory.deleteMany({
        where: {
          userId: LEGACY_USER_ID,
          key: { in: occupiedKeys },
        },
      });
    }

    // Prevent unique collisions on AutonomyConfig(userId, projectId).
    const existingProjectConfigs = await tx.autonomyConfig.findMany({
      where: {
        userId,
        projectId: { not: null },
      },
      select: { projectId: true },
    });
    const occupiedConfigProjectIds = uniqueStrings(
      existingProjectConfigs.map((row) => row.projectId),
    );
    if (occupiedConfigProjectIds.length > 0) {
      await tx.autonomyConfig.deleteMany({
        where: {
          userId: LEGACY_USER_ID,
          projectId: { in: occupiedConfigProjectIds },
        },
      });
    }

    const movedProjects = (
      await tx.project.updateMany({
        where: {
          OR: [
            { ownerId: LEGACY_USER_ID },
            { workspaceId: LEGACY_WORKSPACE_ID },
          ],
        },
        data: {
          ownerId: userId,
          workspaceId,
        },
      })
    ).count;

    const ownedProjects = await tx.project.findMany({
      where: {
        ownerId: userId,
        workspaceId,
      },
      select: { id: true },
    });
    const ownedProjectIds = ownedProjects.map((project) => project.id);

    const movedConversationsByIdentity = (
      await tx.aIConversation.updateMany({
        where: {
          OR: [
            { userId: LEGACY_USER_ID },
            { workspaceId: LEGACY_WORKSPACE_ID },
          ],
        },
        data: {
          userId,
          workspaceId,
        },
      })
    ).count;

    let movedConversationsByProject = 0;
    let movedUsageByProject = 0;
    let movedRunsByProject = 0;
    let movedArtifactsByProject = 0;
    let movedNotesByProject = 0;
    let movedRetrievalsByProject = 0;
    let movedEmbeddingsByProject = 0;
    let movedAutonomyByProject = 0;
    let backfilledStudies = 0;
    let backfilledFiles = 0;

    if (ownedProjectIds.length > 0) {
      movedConversationsByProject = (
        await tx.aIConversation.updateMany({
          where: {
            projectId: { in: ownedProjectIds },
            OR: [
              { userId: null },
              { userId: LEGACY_USER_ID },
              { workspaceId: null },
              { workspaceId: LEGACY_WORKSPACE_ID },
            ],
          },
          data: {
            userId,
            workspaceId,
          },
        })
      ).count;

      movedUsageByProject = (
        await tx.aIUsage.updateMany({
          where: {
            projectId: { in: ownedProjectIds },
            OR: [
              { userId: null },
              { userId: LEGACY_USER_ID },
              { workspaceId: null },
              { workspaceId: LEGACY_WORKSPACE_ID },
            ],
          },
          data: {
            userId,
            workspaceId,
          },
        })
      ).count;

      movedRunsByProject = (
        await tx.agentRun.updateMany({
          where: {
            projectId: { in: ownedProjectIds },
            OR: [
              { userId: null },
              { userId: LEGACY_USER_ID },
            ],
          },
          data: { userId },
        })
      ).count;

      movedArtifactsByProject = (
        await tx.artifact.updateMany({
          where: {
            projectId: { in: ownedProjectIds },
            OR: [
              { userId: null },
              { userId: LEGACY_USER_ID },
            ],
          },
          data: {
            userId,
            appliedByUserId: userId,
          },
        })
      ).count;

      movedNotesByProject = (
        await tx.note.updateMany({
          where: {
            projectId: { in: ownedProjectIds },
            OR: [
              { userId: null },
              { userId: LEGACY_USER_ID },
            ],
          },
          data: { userId },
        })
      ).count;

      movedRetrievalsByProject = (
        await tx.memoryRetrieval.updateMany({
          where: {
            projectId: { in: ownedProjectIds },
            OR: [
              { userId: null },
              { userId: LEGACY_USER_ID },
            ],
          },
          data: { userId },
        })
      ).count;

      movedEmbeddingsByProject = (
        await tx.memoryEmbedding.updateMany({
          where: {
            projectId: { in: ownedProjectIds },
            OR: [
              { userId: null },
              { userId: LEGACY_USER_ID },
            ],
          },
          data: { userId },
        })
      ).count;

      movedAutonomyByProject = (
        await tx.autonomyConfig.updateMany({
          where: {
            projectId: { in: ownedProjectIds },
            OR: [
              { userId: null },
              { userId: LEGACY_USER_ID },
            ],
          },
          data: { userId },
        })
      ).count;

      backfilledStudies = (
        await tx.study.updateMany({
          where: {
            projectId: { in: ownedProjectIds },
            OR: [
              { workspaceId: null },
              { workspaceId: LEGACY_WORKSPACE_ID },
            ],
          },
          data: { workspaceId },
        })
      ).count;

      backfilledFiles = (
        await tx.fileAsset.updateMany({
          where: {
            projectId: { in: ownedProjectIds },
            OR: [
              { workspaceId: null },
              { workspaceId: LEGACY_WORKSPACE_ID },
            ],
          },
          data: { workspaceId },
        })
      ).count;
    }

    const movedUsageByIdentity = (
      await tx.aIUsage.updateMany({
        where: {
          OR: [
            { userId: LEGACY_USER_ID },
            { workspaceId: LEGACY_WORKSPACE_ID },
          ],
        },
        data: {
          userId,
          workspaceId,
        },
      })
    ).count;

    const movedUserMemories = (
      await tx.userMemory.updateMany({
        where: { userId: LEGACY_USER_ID },
        data: { userId },
      })
    ).count;

    await tx.memoryRetrieval.updateMany({
      where: { userId: LEGACY_USER_ID },
      data: { userId },
    });

    await tx.memoryEmbedding.updateMany({
      where: { userId: LEGACY_USER_ID },
      data: { userId },
    });

    await tx.agentRun.updateMany({
      where: { userId: LEGACY_USER_ID },
      data: { userId },
    });

    await tx.artifact.updateMany({
      where: {
        OR: [
          { userId: LEGACY_USER_ID },
          { appliedByUserId: LEGACY_USER_ID },
        ],
      },
      data: {
        userId,
        appliedByUserId: userId,
      },
    });

    await tx.autonomyConfig.updateMany({
      where: { userId: LEGACY_USER_ID },
      data: { userId },
    });

    await tx.note.updateMany({
      where: { userId: LEGACY_USER_ID },
      data: { userId },
    });

    // Remove orphaned placeholder principal rows once reassignment is complete.
    await tx.workspaceMember.deleteMany({
      where: { userId: LEGACY_USER_ID },
    });

    await tx.user.deleteMany({
      where: {
        id: LEGACY_USER_ID,
        projects: { none: {} },
        memberships: { none: {} },
      },
    });

    await tx.workspace.deleteMany({
      where: {
        id: LEGACY_WORKSPACE_ID,
        projects: { none: {} },
        members: { none: {} },
      },
    });

    const movedConversations =
      movedConversationsByIdentity + movedConversationsByProject;
    const movedUsageRows = movedUsageByIdentity + movedUsageByProject;

    return {
      claimed: hasLegacyIdentity,
      movedProjects,
      movedConversations,
      movedUsageRows,
      movedUserMemories,
      backfilledStudies,
      backfilledFiles,
      // Internal counters retained for structured claim logs.
      debug: {
        movedRunsByProject,
        movedArtifactsByProject,
        movedNotesByProject,
        movedRetrievalsByProject,
        movedEmbeddingsByProject,
        movedAutonomyByProject,
      },
    };
  }, {
    timeout: LEGACY_CLAIM_TX_TIMEOUT_MS,
  });

  if (result.claimed) {
    logServerInfo("auth-claim", "migrated legacy placeholder data", {
      userId,
      workspaceId,
      movedProjects: result.movedProjects,
      movedConversations: result.movedConversations,
      movedUsageRows: result.movedUsageRows,
      movedUserMemories: result.movedUserMemories,
      backfilledStudies: result.backfilledStudies,
      backfilledFiles: result.backfilledFiles,
      ...(result.debug ? { debug: result.debug } : {}),
    });
  }

  claimedUsers.add(userId);

  const { debug, ...publicResult } = result;
  void debug;
  return publicResult;
}
