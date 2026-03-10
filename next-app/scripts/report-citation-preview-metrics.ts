import { config } from "dotenv";
config({ path: ".env.local" });
config();

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

async function main() {
    const since = parseDateArg("since", new Date(Date.now() - 24 * 60 * 60 * 1000));
    const until = parseDateArg("until", new Date());

    const rows = await prisma.chatUnificationMetric.findMany({
        where: {
            recordedAt: {
                gte: since,
                lte: until,
            },
            type: {
                startsWith: "citation_preview.",
            },
        },
        select: {
            type: true,
            payload: true,
        },
        orderBy: {
            recordedAt: "asc",
        },
    }) as CitationMetricRow[];

    const completed = rows.filter((row) => row.type === "citation_preview.metadata_request_completed");
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

    console.log(`Citation preview report (${since.toISOString()} -> ${until.toISOString()})`);
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
}

main()
    .catch((error) => {
        console.error("[report-citation-preview-metrics] failed", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
