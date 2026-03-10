import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { fileURLToPath } from "node:url";
import { prisma } from "../lib/server/prisma";

type CitationMetricRow = {
    type: string;
    payload: unknown;
};

type CitationMetricPayload = {
    citationType?: "DOI" | "PubMed" | null;
    fromCache?: boolean;
    latencyMs?: number;
    resolutionPath?: string;
    reason?: string;
    resolvedWithCitationCount?: boolean;
    hadDoiFallbackCandidate?: boolean;
    continuationRecoveredCount?: boolean;
};

type MetricReportFilters = {
    workspaceIds: string[];
    projectIds: string[];
};

function parseArg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const arg = process.argv.find((value) => value.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : undefined;
}

function parseDateArg(name: string, fallback: Date): Date {
    const raw = parseArg(name);
    if (!raw) return fallback;
    const timestamp = Date.parse(raw);
    if (!Number.isFinite(timestamp)) {
        throw new Error(`Invalid ISO date for --${name}: ${raw}`);
    }
    return new Date(timestamp);
}

export function parseCsvArg(name: string): string[] {
    const raw = parseArg(name);
    if (!raw) return [];

    return raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function asPayload(value: unknown): CitationMetricPayload {
    if (!value || typeof value !== "object") return {};
    return value as CitationMetricPayload;
}

function percentile(sorted: number[], ratio: number): number | null {
    if (sorted.length === 0) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index] ?? null;
}

function increment(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
}

export function buildMetricReportFilters(): MetricReportFilters {
    return {
        workspaceIds: parseCsvArg("workspaceIds"),
        projectIds: parseCsvArg("projectIds"),
    };
}

export function buildMetricReportWhereClause(
    since: Date,
    until: Date,
    filters: MetricReportFilters,
) {
    return {
        recordedAt: {
            gte: since,
            lte: until,
        },
        type: {
            startsWith: "citation_preview.",
        },
        ...(filters.workspaceIds.length > 0
            ? {
                workspaceId: {
                    in: filters.workspaceIds,
                },
            }
            : {}),
        ...(filters.projectIds.length > 0
            ? {
                projectId: {
                    in: filters.projectIds,
                },
            }
            : {}),
    };
}

function describeScope(filters: MetricReportFilters): string {
    const parts: string[] = [];
    if (filters.workspaceIds.length > 0) {
        parts.push(`workspaces=${filters.workspaceIds.join(",")}`);
    }
    if (filters.projectIds.length > 0) {
        parts.push(`projects=${filters.projectIds.join(",")}`);
    }
    return parts.length > 0 ? parts.join(" ") : "global";
}

export async function main() {
    const since = parseDateArg("since", new Date(Date.now() - 24 * 60 * 60 * 1000));
    const until = parseDateArg("until", new Date());
    const filters = buildMetricReportFilters();

    const rows = await prisma.chatUnificationMetric.findMany({
        where: buildMetricReportWhereClause(since, until, filters),
        select: {
            type: true,
            payload: true,
        },
        orderBy: {
            recordedAt: "asc",
        },
    }) as CitationMetricRow[];

    const completed = rows.filter((row) => row.type === "citation_preview.metadata_request_completed");
    const continuationCompleted = rows.filter(
        (row) => row.type === "citation_preview.continuation_completed",
    );
    const continuationFailed = rows.filter(
        (row) => row.type === "citation_preview.continuation_failed",
    );
    const continuationAttempts = [...continuationCompleted, ...continuationFailed];
    const uncachedLatencies = completed
        .map((row) => asPayload(row.payload))
        .filter((payload) => payload.fromCache === false && typeof payload.latencyMs === "number")
        .map((payload) => payload.latencyMs as number)
        .sort((a, b) => a - b);

    const citationTypeCounts = new Map<string, number>();
    const resolutionPathCounts = new Map<string, number>();
    const reasonCounts = new Map<string, number>();

    let completedWithCount = 0;
    let pubmedDoiCandidates = 0;
    let pubmedDoiCandidatesBibliographyOnly = 0;
    let continuationRecoveredCount = 0;

    const continuationLatencies = continuationAttempts
        .map((row) => asPayload(row.payload))
        .filter((payload) => typeof payload.latencyMs === "number")
        .map((payload) => payload.latencyMs as number)
        .sort((a, b) => a - b);

    for (const row of completed) {
        const payload = asPayload(row.payload);
        increment(citationTypeCounts, payload.citationType ?? "unknown");
        increment(resolutionPathCounts, payload.resolutionPath ?? "unknown");
        increment(reasonCounts, payload.reason ?? "unknown");

        if (payload.resolvedWithCitationCount) {
            completedWithCount += 1;
        }
        if (payload.citationType === "PubMed" && payload.hadDoiFallbackCandidate) {
            pubmedDoiCandidates += 1;
            if (payload.resolutionPath === "pubmed_bibliography_only") {
                pubmedDoiCandidatesBibliographyOnly += 1;
            }
        }
    }

    for (const row of continuationAttempts) {
        const payload = asPayload(row.payload);
        if (payload.continuationRecoveredCount) {
            continuationRecoveredCount += 1;
        }
    }

    const typeBreakdown = Array.from(citationTypeCounts.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join(", ") || "none";
    const pathBreakdown = Array.from(resolutionPathCounts.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join(", ") || "none";
    const reasonBreakdown = Array.from(reasonCounts.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join(", ") || "none";

    const countSuccessRate = completed.length > 0
        ? ((completedWithCount / completed.length) * 100).toFixed(1)
        : "n/a";
    const bibliographyOnlyRate = pubmedDoiCandidates > 0
        ? ((pubmedDoiCandidatesBibliographyOnly / pubmedDoiCandidates) * 100).toFixed(1)
        : "n/a";

    console.log(
        `Citation preview report (${since.toISOString()} -> ${until.toISOString()}) [scope: ${describeScope(filters)}]`,
    );
    console.log(`Total completed citation fetches: ${completed.length}`);
    console.log(`Citation type breakdown: ${typeBreakdown}`);
    console.log(`Resolution path counts: ${pathBreakdown}`);
    console.log(`Reason counts: ${reasonBreakdown}`);
    console.log(`Count-bearing success rate: ${countSuccessRate === "n/a" ? "n/a" : `${countSuccessRate}%`}`);
    console.log(
        `Uncached latency p50/p95: ${
            uncachedLatencies.length === 0
                ? "n/a"
                : `${percentile(uncachedLatencies, 0.5)}ms / ${percentile(uncachedLatencies, 0.95)}ms`
        }`,
    );
    console.log(
        `PubMed DOI-bearing lookups ending bibliography-only: ${
            bibliographyOnlyRate === "n/a" ? "n/a" : `${bibliographyOnlyRate}%`
        } (${pubmedDoiCandidatesBibliographyOnly}/${pubmedDoiCandidates})`,
    );
    console.log(`Continuation attempts total: ${continuationAttempts.length}`);
    console.log(`Continuation attempts completed: ${continuationCompleted.length}`);
    console.log(`Continuation attempts failed: ${continuationFailed.length}`);
    console.log(`Continuation recovered count: ${continuationRecoveredCount}`);
    console.log(
        `Continuation recovery rate: ${
            continuationAttempts.length > 0
                ? `${((continuationRecoveredCount / continuationAttempts.length) * 100).toFixed(1)}%`
                : "n/a"
        }`,
    );
    console.log(
        `Continuation latency p50/p95: ${
            continuationLatencies.length === 0
                ? "n/a"
                : `${percentile(continuationLatencies, 0.5)}ms / ${percentile(continuationLatencies, 0.95)}ms`
        }`,
    );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main()
        .catch((error) => {
            console.error("[report-citation-preview-metrics] failed", error);
            process.exitCode = 1;
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
