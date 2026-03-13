import { prisma } from "@/lib/server/prisma";
import { AIErrorWithEnvelope, createRunConflictErrorEnvelope } from "@/lib/ai/error-envelope";
import { assessRunConvergence } from "@/lib/server/agent/run-convergence";
import type {
  RunAbnormalEndClassification,
  RunFinalizationState,
} from "@/types/agent";

export const DEFAULT_CONVERSATION_RUN_STALE_MS = 90_000;

type RunningConversationRun = {
  id: string;
  status: "running";
  startedAt: Date;
  lastActivityAt: Date;
  lastDurableProgressAt: Date;
  finalizationState: RunFinalizationState;
  abnormalEndClassification: RunAbnormalEndClassification | null;
};

export interface ConversationRunLockStore {
  listRunning(conversationId: string): Promise<RunningConversationRun[]>;
  cancelRuns(runIds: string[], completedAt: Date): Promise<number>;
  cancelRunIfActive(runId: string, conversationId: string, completedAt: Date): Promise<boolean>;
}

const prismaConversationRunLockStore: ConversationRunLockStore = {
  async listRunning(conversationId: string): Promise<RunningConversationRun[]> {
    const rows = await prisma.agentRun.findMany({
      where: { conversationId, status: "running" },
      select: {
        id: true,
        status: true,
        startedAt: true,
        lastActivityAt: true,
        lastDurableProgressAt: true,
        finalizationState: true,
        abnormalEndClassification: true,
      },
      orderBy: { lastActivityAt: "asc" },
    });
    return rows.map((row) => ({
      ...row,
      status: "running",
      finalizationState: row.finalizationState as RunFinalizationState,
      abnormalEndClassification: row.abnormalEndClassification as RunAbnormalEndClassification | null,
    }));
  },
  async cancelRuns(runIds: string[], completedAt: Date): Promise<number> {
    if (runIds.length === 0) return 0;
    const result = await prisma.agentRun.updateMany({
      where: { id: { in: runIds }, status: "running", completedAt: null },
      data: {
        status: "cancelled",
        completedAt,
        lastActivityAt: completedAt,
        lastDurableProgressAt: completedAt,
        finalizationState: "completed",
      },
    });
    return result.count;
  },
  async cancelRunIfActive(runId: string, conversationId: string, completedAt: Date): Promise<boolean> {
    const result = await prisma.agentRun.updateMany({
      where: { id: runId, conversationId, status: "running", completedAt: null },
      data: {
        status: "cancelled",
        completedAt,
        lastActivityAt: completedAt,
        lastDurableProgressAt: completedAt,
        finalizationState: "completed",
      },
    });
    return result.count > 0;
  },
};

export async function ensureConversationRunAvailability(
  conversationId: string,
  options?: {
    now?: Date;
    staleMs?: number;
    store?: ConversationRunLockStore;
    replaceRunId?: string;
  }
): Promise<{ cancelledStaleRunCount: number; replacedRunId: string | null }> {
  const now = options?.now ?? new Date();
  const staleMs = options?.staleMs ?? DEFAULT_CONVERSATION_RUN_STALE_MS;
  const store = options?.store ?? prismaConversationRunLockStore;
  const replaceRunId = options?.replaceRunId?.trim() || undefined;
  const cutoff = new Date(now.getTime() - staleMs);

  const running = await store.listRunning(conversationId);
  if (running.length === 0) {
    return { cancelledStaleRunCount: 0, replacedRunId: null };
  }

  const staleRunIds: string[] = [];
  const freshRunIds: string[] = [];
  for (const run of running) {
    if (run.lastActivityAt < cutoff) staleRunIds.push(run.id);
    else freshRunIds.push(run.id);
  }

  let cancelledStaleRunCount = 0;
  if (staleRunIds.length > 0) {
    cancelledStaleRunCount = await store.cancelRuns(staleRunIds, now);
  }

  if (freshRunIds.length > 0) {
    const activeRunId = freshRunIds[0]!;
    const activeRun = running.find((run) => run.id === activeRunId)!;
    const activeAssessment = assessRunConvergence(activeRun, now, staleMs);
    if (!replaceRunId) {
      throw new AIErrorWithEnvelope(
        createRunConflictErrorEnvelope({
          code: "ACTIVE_RUN_EXISTS",
          conversationId,
          activeRunId,
          lastActivityAt: activeRun.lastActivityAt.toISOString(),
          recoveryRecommendation: activeAssessment.recoveryRecommendation,
        }),
      );
    }

    if (replaceRunId !== activeRunId) {
      throw new AIErrorWithEnvelope(
        createRunConflictErrorEnvelope({
          code: "REPLACE_TARGET_MISMATCH",
          conversationId,
          activeRunId,
          replaceRunId,
          lastActivityAt: activeRun.lastActivityAt.toISOString(),
          recoveryRecommendation: "stop_and_retry",
        }),
      );
    }

    const replaced = await store.cancelRunIfActive(replaceRunId, conversationId, now);
    if (!replaced) {
      const latestRunning = await store.listRunning(conversationId);
      const latestFresh = latestRunning.find((run) => run.lastActivityAt >= cutoff);
      if (latestFresh) {
        const latestAssessment = assessRunConvergence(latestFresh, now, staleMs);
        // The replace target disappeared before we could cancel it. If the same
        // run is still active we surface the ordinary active-run conflict;
        // otherwise a different run won the race and the replace target mismatched.
        throw new AIErrorWithEnvelope(
          createRunConflictErrorEnvelope({
            code: latestFresh.id === replaceRunId ? "ACTIVE_RUN_EXISTS" : "REPLACE_TARGET_MISMATCH",
            conversationId,
            activeRunId: latestFresh.id,
            replaceRunId,
            lastActivityAt: latestFresh.lastActivityAt.toISOString(),
            recoveryRecommendation: latestFresh.id === replaceRunId
              ? latestAssessment.recoveryRecommendation
              : "stop_and_retry",
          }),
        );
      }
    }

    const remainingRunning = await store.listRunning(conversationId);
    const remainingFresh = remainingRunning.find((run) => run.lastActivityAt >= cutoff);
    if (remainingFresh) {
      const remainingAssessment = assessRunConvergence(remainingFresh, now, staleMs);
      throw new AIErrorWithEnvelope(
        createRunConflictErrorEnvelope({
          code: "ACTIVE_RUN_EXISTS",
          conversationId,
          activeRunId: remainingFresh.id,
          lastActivityAt: remainingFresh.lastActivityAt.toISOString(),
          recoveryRecommendation: remainingAssessment.recoveryRecommendation,
        }),
      );
    }

    return { cancelledStaleRunCount, replacedRunId: replaceRunId };
  }

  return { cancelledStaleRunCount, replacedRunId: null };
}
