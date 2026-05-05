import { requireApiSession } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import {
  cancelRun,
  isRunOwnershipError,
  settleClarificationDismissedRun,
} from "@/lib/server/agent/run";
import { abortActiveRunExecution } from "@/lib/server/agent/run-cancellation";
import type { RunStatus } from "@/types/agent";

const TERMINAL_RUN_STATUSES = new Set<RunStatus>([
  "completed",
  "failed",
  "cancelled",
]);

function isTerminalRunStatus(status: string): status is RunStatus {
  return TERMINAL_RUN_STATUSES.has(status as RunStatus);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const authResult = await requireApiSession(request);
  if (!authResult.ok) return authResult.response;

  const { runId } = await context.params;
  const run = await prisma.agentRun.findFirst({
    where: {
      id: runId,
      userId: authResult.context.userId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }

  if (isTerminalRunStatus(run.status)) {
    return Response.json({
      runId: run.id,
      status: run.status,
      abortedInProcess: false,
      alreadyTerminal: true,
    });
  }

  const abortedInProcess = abortActiveRunExecution(run.id);

  try {
    if (run.status === "paused") {
      await settleClarificationDismissedRun(run.id, { requireActive: true });
    } else {
      await cancelRun(run.id);
    }
  } catch (error) {
    if (!isRunOwnershipError(error)) {
      throw error;
    }
    const latest = await prisma.agentRun.findFirst({
      where: {
        id: run.id,
        userId: authResult.context.userId,
      },
      select: {
        status: true,
      },
    });
    if (latest && isTerminalRunStatus(latest.status)) {
      return Response.json({
        runId: run.id,
        status: latest.status,
        abortedInProcess,
        alreadyTerminal: true,
      });
    }
    return Response.json({ error: "Run could not be cancelled because it is no longer writable." }, { status: 409 });
  }

  return Response.json({
    runId: run.id,
    status: "cancelled",
    abortedInProcess,
    alreadyTerminal: false,
  });
}
