"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { getTokenUsageTodayAction } from "@/app/actions/usage";

type UseProjectTokenUsageOptions = {
  pollMs?: number;
};

type TokenUsageState = {
  projectId: string;
  totalTokens: number | null;
};

export function useProjectTokenUsage(
  projectId: string,
  { pollMs = 60_000 }: UseProjectTokenUsageOptions = {},
) {
  const [usageState, setUsageState] = useState<TokenUsageState>({
    projectId,
    totalTokens: null,
  });

  const syncUsage = useEffectEvent(async (activeRef: { current: boolean }, activeProjectId: string) => {
    const result = await getTokenUsageTodayAction(activeProjectId);
    if (!activeRef.current) return;
    if (result.success) {
      setUsageState((current) => {
        if (
          current.projectId === activeProjectId
          && current.totalTokens === result.data.totalTokens
        ) {
          return current;
        }
        return {
          projectId: activeProjectId,
          totalTokens: result.data.totalTokens,
        };
      });
    }
  });

  useEffect(() => {
    if (!projectId) return;

    const activeRef = { current: true };
    void syncUsage(activeRef, projectId);
    const interval = window.setInterval(() => {
      void syncUsage(activeRef, projectId);
    }, pollMs);

    return () => {
      activeRef.current = false;
      window.clearInterval(interval);
    };
  }, [pollMs, projectId]);

  return usageState.projectId === projectId ? usageState.totalTokens : null;
}
