"use client";

import { useEffect, useState } from "react";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { useParams } from "next/navigation";
import { getTokenUsageTodayAction } from "@/app/actions/usage";
import styles from "./StatusIndicator.module.css";

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

export function StatusIndicator() {
    const { currentRunId } = useProjectCopilot();
    const params = useParams<{ id: string }>();
    const projectId = params?.id ?? "";
    const [totalTokens, setTotalTokens] = useState<number | null>(null);

    useEffect(() => {
        if (!projectId) return;

        let cancelled = false;
        const fetchUsage = () => {
            getTokenUsageTodayAction(projectId).then((res) => {
                if (!cancelled && res.success) setTotalTokens(res.data.totalTokens);
            }).catch(() => {});
        };

        fetchUsage();
        const interval = setInterval(fetchUsage, 60_000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [projectId]);

    return (
        <div className={styles.status}>
            {currentRunId && (
                <span className={styles.runIndicator}>
                    <span className={styles.runDot} />
                    Running
                </span>
            )}
            {totalTokens !== null && totalTokens > 0 && (
                <span className={styles.tokenCount} title={`${totalTokens.toLocaleString()} tokens today`}>
                    {formatTokens(totalTokens)} tokens
                </span>
            )}
        </div>
    );
}
