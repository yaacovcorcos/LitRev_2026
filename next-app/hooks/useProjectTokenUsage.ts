"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { getTokenUsageTodayAction } from "@/app/actions/usage";

type UseProjectTokenUsageOptions = {
  pollMs?: number;
};

export function useProjectTokenUsage(
  projectId: string,
  { pollMs = 60_000 }: UseProjectTokenUsageOptions = {},
) {
  const [totalTokens, setTotalTokens] = useState<number | null>(null);

  const syncUsage = useEffectEvent(async (activeRef: { current: boolean }) => {
    const result = await getTokenUsageTodayAction(projectId);
    if (!activeRef.current) return;
    if (result.success) {
      setTotalTokens(result.data.totalTokens);
    }
  });

  useEffect(() => {
    if (!projectId) {
      setTotalTokens(null);
      return;
    }

    const activeRef = { current: true };
    void syncUsage(activeRef);
    const interval = window.setInterval(() => {
      void syncUsage(activeRef);
    }, pollMs);

    return () => {
      activeRef.current = false;
      window.clearInterval(interval);
    };
  }, [pollMs, projectId, syncUsage]);

  return totalTokens;
}
