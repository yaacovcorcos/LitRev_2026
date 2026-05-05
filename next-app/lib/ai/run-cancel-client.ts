export type CancelAgentRunResult = "cancelled" | "not_found" | "conflict";

function normalizeRunId(runId: string | null | undefined): string | null {
  const trimmed = runId?.trim();
  return trimmed ? trimmed : null;
}

export async function cancelAgentRun(runId: string | null | undefined): Promise<CancelAgentRunResult | null> {
  const normalizedRunId = normalizeRunId(runId);
  if (!normalizedRunId) return null;

  const response = await fetch(`/api/ai/runs/${encodeURIComponent(normalizedRunId)}/cancel`, {
    method: "POST",
  });

  if (response.status === 404) return "not_found";
  if (response.status === 409) return "conflict";
  if (!response.ok) {
    throw new Error(`Agent run cancellation failed with HTTP ${response.status}`);
  }
  return "cancelled";
}

export function requestAgentRunCancellation(runId: string | null | undefined): void {
  void cancelAgentRun(runId).catch(() => {
    // Explicit user stop must never surface as an unhandled client error.
  });
}
