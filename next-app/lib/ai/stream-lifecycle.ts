import type { AIStreamChunk } from "@/types/ai";

export type StreamTerminalReason =
  | "completed"
  | "cancelled_by_user"
  | "failed_network"
  | "failed_server"
  | "timed_out";

export type StreamRunPhase = "idle" | "running" | "terminal";

export type StreamLifecycleSnapshot = {
  attemptId: string;
  phase: StreamRunPhase;
  terminalReason: StreamTerminalReason | null;
};

export function createLifecycleSnapshot(attemptId: string): StreamLifecycleSnapshot {
  return {
    attemptId,
    phase: "running",
    terminalReason: null,
  };
}

export function finalizeLifecycle(
  current: StreamLifecycleSnapshot,
  reason: StreamTerminalReason,
): { snapshot: StreamLifecycleSnapshot; applied: boolean } {
  if (current.phase === "terminal") {
    return { snapshot: current, applied: false };
  }
  return {
    snapshot: {
      ...current,
      phase: "terminal",
      terminalReason: reason,
    },
    applied: true,
  };
}

export function terminalReasonFromRunEnd(params: {
  runStatus: string | null | undefined;
  stopReason: string | null | undefined;
}): StreamTerminalReason {
  const runStatus = params.runStatus?.toLowerCase() ?? null;
  const stopReason = params.stopReason?.toLowerCase() ?? null;

  if (runStatus === "completed") return "completed";
  if (runStatus === "cancelled" || runStatus === "canceled") return "cancelled_by_user";
  if (stopReason === "cancelled" || stopReason === "aborted") return "cancelled_by_user";
  return "failed_server";
}

export function terminalReasonFromErrorChunk(chunk: AIStreamChunk): StreamTerminalReason {
  // TODO: Differentiate more granularly if server starts emitting transport-origin metadata.
  void chunk;
  return "failed_server";
}

export function terminalReasonFromThrownError(
  error: unknown,
  options?: { isUserAbort?: boolean; timedOut?: boolean },
): StreamTerminalReason {
  if (options?.timedOut) return "timed_out";
  if (options?.isUserAbort) return "cancelled_by_user";

  if (error instanceof DOMException && error.name === "AbortError") {
    return "cancelled_by_user";
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const networkHints = ["network", "failed to fetch", "econn", "timeout", "timed out", "socket", "offline"];
  if (networkHints.some((hint) => message.includes(hint))) {
    return "failed_network";
  }

  return "failed_server";
}
