"use client";

import { useProjectConversation } from "@/contexts/ProjectConversationContext";
import { useParams } from "next/navigation";
import { useProjectTokenUsage } from "@/hooks/useProjectTokenUsage";
import styles from "./StatusIndicator.module.css";

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

export function StatusIndicator() {
    const { currentRunId } = useProjectConversation();
    const params = useParams<{ id: string }>();
    const projectId = params?.id ?? "";
    const totalTokens = useProjectTokenUsage(projectId);

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
