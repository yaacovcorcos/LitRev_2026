"use client";

import { useEffect, useState } from "react";
import { getRecentActivityAction } from "@/app/actions/activity";
import { useIdleTask } from "@/hooks/useIdleTask";
import type { ProjectActivityItem } from "@/types/activity";

type UseRecentProjectActivityOptions = {
  limit?: number;
  deferUntilIdle?: boolean;
};

type UseRecentProjectActivityResult = {
  items: ProjectActivityItem[];
  isLoading: boolean;
  hasError: boolean;
};

export function useRecentProjectActivity(
  projectId: string,
  {
    limit = 8,
    deferUntilIdle = false,
  }: UseRecentProjectActivityOptions = {},
): UseRecentProjectActivityResult {
  const [items, setItems] = useState<ProjectActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [loadEnabled, setLoadEnabled] = useState(() => !deferUntilIdle);

  useEffect(() => {
    setItems([]);
    setHasError(false);
    setIsLoading(true);
    setLoadEnabled(!deferUntilIdle);
  }, [deferUntilIdle, limit, projectId]);

  useIdleTask(() => {
    setLoadEnabled(true);
  }, {
    enabled: deferUntilIdle && !loadEnabled,
    timeoutMs: 500,
    fallbackDelayMs: 250,
  });

  useEffect(() => {
    if (!projectId || !loadEnabled) return;

    let isActive = true;
    setIsLoading(true);
    setHasError(false);

    getRecentActivityAction(projectId, limit)
      .then((result) => {
        if (!isActive) return;
        if (result.success) {
          setItems(result.data);
          return;
        }
        setItems([]);
        setHasError(true);
      })
      .catch(() => {
        if (!isActive) return;
        setHasError(true);
        setItems([]);
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [limit, loadEnabled, projectId]);

  return {
    items,
    isLoading,
    hasError,
  };
}
