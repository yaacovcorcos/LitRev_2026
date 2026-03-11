import type { TimelineItem } from "@/types/timeline";

export type NormalizedProgressItem = {
    id: string;
    type: "progress";
    message: string;
    current?: number;
    total?: number;
};

export function normalizeTimelineProgressItems(items: readonly TimelineItem[]): NormalizedProgressItem[] {
    return items.flatMap((item) => (
        item.type === "progress"
            ? [{
                id: item.id,
                type: "progress" as const,
                message: item.message,
                current: item.current,
                total: item.total,
            }]
            : []
    ));
}

export function selectActiveProgress(items: readonly NormalizedProgressItem[]): {
    activeProgress: NormalizedProgressItem | null;
    suppressedProgressId: string | null;
} {
    const activeProgress = items.at(-1) ?? null;
    return {
        activeProgress,
        suppressedProgressId: activeProgress?.id ?? null,
    };
}
