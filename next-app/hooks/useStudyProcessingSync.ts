"use client";

import { useEffect, useEffectEvent } from "react";
import { listStudyProcessingStatesAction } from "@/app/actions/extraction";
import type { Study } from "@/types/ledger";

type UseStudyProcessingSyncInput = {
  projectId?: string;
  studyIds: string[];
  enabled: boolean;
  intervalMs: number;
  onStudiesReceived: (studies: Study[]) => void;
};

export function useStudyProcessingSync({
  projectId,
  studyIds,
  enabled,
  intervalMs,
  onStudiesReceived,
}: UseStudyProcessingSyncInput) {
  const handleStudiesReceived = useEffectEvent(onStudiesReceived);

  const runSync = useEffectEvent(async () => {
    if (!enabled || !projectId || studyIds.length === 0) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    const result = await listStudyProcessingStatesAction(projectId, studyIds);
    if (!result.success) return;

    const studies = result.data
      .map((item) => item.study)
      .filter((study): study is Study => Boolean(study));

    handleStudiesReceived(studies);
  });

  useEffect(() => {
    if (!enabled || !projectId || studyIds.length === 0) return;

    let intervalId: number | null = null;

    const start = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => {
        void runSync();
      }, intervalMs);
    };

    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runSync();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") {
      void runSync();
      start();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs, projectId, studyIds]);
}
