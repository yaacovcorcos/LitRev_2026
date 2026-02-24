import { prisma } from "@/lib/server/prisma";

export const DEFAULT_CONVERSATION_RUN_STALE_MS = 20 * 60 * 1000;

type RunningConversationRun = {
  id: string;
  startedAt: Date;
};

export interface ConversationRunLockStore {
  listRunning(conversationId: string): Promise<RunningConversationRun[]>;
  cancelRuns(runIds: string[], completedAt: Date): Promise<number>;
}

const prismaConversationRunLockStore: ConversationRunLockStore = {
  async listRunning(conversationId: string): Promise<RunningConversationRun[]> {
    return prisma.agentRun.findMany({
      where: { conversationId, status: "running" },
      select: { id: true, startedAt: true },
      orderBy: { startedAt: "asc" },
    });
  },
  async cancelRuns(runIds: string[], completedAt: Date): Promise<number> {
    if (runIds.length === 0) return 0;
    const result = await prisma.agentRun.updateMany({
      where: { id: { in: runIds }, status: "running" },
      data: { status: "cancelled", completedAt },
    });
    return result.count;
  },
};

export async function ensureConversationRunAvailability(
  conversationId: string,
  options?: {
    now?: Date;
    staleMs?: number;
    store?: ConversationRunLockStore;
  }
): Promise<{ cancelledStaleRunCount: number }> {
  const now = options?.now ?? new Date();
  const staleMs = options?.staleMs ?? DEFAULT_CONVERSATION_RUN_STALE_MS;
  const store = options?.store ?? prismaConversationRunLockStore;
  const cutoff = new Date(now.getTime() - staleMs);

  const running = await store.listRunning(conversationId);
  if (running.length === 0) {
    return { cancelledStaleRunCount: 0 };
  }

  const staleRunIds: string[] = [];
  const freshRunIds: string[] = [];
  for (const run of running) {
    if (run.startedAt < cutoff) staleRunIds.push(run.id);
    else freshRunIds.push(run.id);
  }

  let cancelledStaleRunCount = 0;
  if (staleRunIds.length > 0) {
    cancelledStaleRunCount = await store.cancelRuns(staleRunIds, now);
  }

  if (freshRunIds.length > 0) {
    throw new Error(
      `Conversation ${conversationId} already has an active run (${freshRunIds[0]}).`
    );
  }

  return { cancelledStaleRunCount };
}

