import type { AIStreamChunk } from "@/types/ai";

export type StreamTerminalReason =
  | "completed"
  | "paused_for_input"
  | "cancelled_by_user"
  | "failed_interrupted"
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
  if (runStatus === "paused" || stopReason === "paused_for_input") return "paused_for_input";
  if (runStatus === "cancelled") return "cancelled_by_user";
  if (stopReason === "cancelled" || stopReason === "aborted") return "cancelled_by_user";
  return "failed_server";
}

export function isSuccessfulTerminalReason(reason: StreamTerminalReason | null): boolean {
  return reason === "completed" || reason === "paused_for_input";
}

export function isFailureTerminalReason(reason: StreamTerminalReason | null): boolean {
  return reason === "failed_interrupted" || reason === "failed_network" || reason === "failed_server" || reason === "timed_out";
}

export function terminalReasonFromErrorChunk(chunk: AIStreamChunk): StreamTerminalReason {
  const status = chunk.errorStatus ?? null;
  if (typeof status === "number" && status >= 400) {
    return "failed_server";
  }
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

  if (error instanceof TypeError) return "failed_network";

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const networkHints = ["network", "failed to fetch", "econn", "timeout", "timed out", "socket", "offline"];
  if (networkHints.some((hint) => message.includes(hint))) {
    return "failed_network";
  }

  return "failed_server";
}
