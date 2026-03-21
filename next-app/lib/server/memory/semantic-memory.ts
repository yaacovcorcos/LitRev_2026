import "server-only";

import crypto from "node:crypto";
import OpenAI from "openai";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { logServerError } from "@/lib/server/logging";

const EMBEDDING_MODEL = process.env.MEMORY_EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_DIMENSION = 1536;
const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_MAX_RETRIES = 3;
const EMBEDDING_RETRY_BASE_MS = 500;
const MAX_USER_SCOPE_MEMORIES = 80;
const MAX_PROJECT_SCOPE_MEMORIES = 160;
const MAX_STUDY_SCOPE_MEMORIES = 160;
const MAX_SCOPE_MEMORIES = 300;
const MAX_SEMANTIC_RESULTS = 20;

type SemanticMemoryScope = "user" | "project" | "study";

interface ScopeMemory {
    memoryType: SemanticMemoryScope;
    memoryId: string;
    userId: string | null;
    projectId: string | null;
    studyId: string | null;
    domainType: string;
    content: string;
    tags: string[];
    contentHash: string;
}

interface SemanticScoreRow {
    memoryType: string;
    memoryId: string;
    score: number | string;
}

export interface SemanticMemoryContext {
    userId: string;
    projectId?: string;
    studyId?: string;
    query?: string;
}

export interface SemanticMemoryOptions {
    minRelevance: number;
    includeUser: boolean;
    includeProject: boolean;
    includeStudy: boolean;
}

export interface SemanticRetrievedMemory {
    id: string;
    type: "user" | "project" | "study";
    memoryType: string;
    content: string;
    relevance: number;
    updatedAt?: string;
    source?: string;
    tags?: string[];
}

export interface SemanticWarmupResult {
    scanned: number;
    indexed: number;
    model: string;
}

export interface SemanticRolloutStatus {
    extensionInstalled: boolean;
    embeddingTablePresent: boolean;
    hnswIndexPresent: boolean;
    totalEmbeddings: number;
    model: string;
    healthy: boolean;
}

let openAIClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    if (!openAIClient) {
        openAIClient = new OpenAI({ apiKey });
    }
    return openAIClient;
}

function normalizeText(input: string): string {
    return input.replace(/\s+/g, " ").trim();
}

function contentHash(input: string): string {
    return crypto.createHash("sha256").update(input).digest("hex");
}

function embeddingLiteral(vector: number[]): string {
    return `[${vector.map((value) => (Number.isFinite(value) ? value.toFixed(8) : "0")).join(",")}]`;
}

function toScore(value: number | string): number {
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function clampRelevance(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function chunk<T>(items: T[], size: number): T[][] {
    if (items.length === 0) return [];
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }
    return result;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function isRetriableEmbeddingError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const status = "status" in error ? Number((error as { status?: unknown }).status) : NaN;
    if (!Number.isFinite(status)) return false;
    return status === 408 || status === 409 || status === 429 || status >= 500;
}

function retryDelayMs(attempt: number): number {
    const jitter = Math.floor(Math.random() * 100);
    return EMBEDDING_RETRY_BASE_MS * (2 ** attempt) + jitter;
}

async function createEmbeddingsWithRetry(client: OpenAI, input: string[] | string) {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < EMBEDDING_MAX_RETRIES; attempt += 1) {
        try {
            return await client.embeddings.create({
                model: EMBEDDING_MODEL,
                input,
                dimensions: EMBEDDING_DIMENSION,
            });
        } catch (error) {
            lastError = error;
            const shouldRetry = isRetriableEmbeddingError(error) && attempt < EMBEDDING_MAX_RETRIES - 1;
            if (!shouldRetry) throw error;
            await sleep(retryDelayMs(attempt));
        }
    }

    throw lastError instanceof Error ? lastError : new Error("Embedding request failed");
}

async function collectScopeMemories(
    context: SemanticMemoryContext,
    options: SemanticMemoryOptions,
): Promise<ScopeMemory[]> {
    const collected: ScopeMemory[] = [];

    if (options.includeUser) {
        const userMemories = await prisma.userMemory.findMany({
            where: {
                userId: context.userId,
                status: "active",
            },
            orderBy: { updatedAt: "desc" },
            take: MAX_USER_SCOPE_MEMORIES,
        });

        for (const memory of userMemories) {
            const content = normalizeText(
                `${memory.key}: ${memory.value}${memory.rationale ? ` (${memory.rationale})` : ""}`,
            );
            collected.push({
                memoryType: "user",
                memoryId: memory.id,
                userId: memory.userId,
                projectId: null,
                studyId: null,
                domainType: memory.type,
                content,
                tags: memory.tags,
                contentHash: contentHash(content),
            });
        }
    }

    if (options.includeProject && context.projectId) {
        const projectMemories = await prisma.projectMemory.findMany({
            where: {
                projectId: context.projectId,
                status: "active",
            },
            orderBy: [
                { importance: "desc" },
                { updatedAt: "desc" },
            ],
            take: MAX_PROJECT_SCOPE_MEMORIES,
        });

        for (const memory of projectMemories) {
            const content = normalizeText(
                `[${memory.type}${memory.category ? ` - ${memory.category}` : ""}] ${memory.statement}${memory.rationale ? ` | Rationale: ${memory.rationale}` : ""}`,
            );
            collected.push({
                memoryType: "project",
                memoryId: memory.id,
                userId: null,
                projectId: memory.projectId,
                studyId: null,
                domainType: memory.type,
                content,
                tags: memory.tags,
                contentHash: contentHash(content),
            });
        }
    }

    if (options.includeStudy) {
        const studyWhere = context.studyId
            ? {
                status: "active" as const,
                studyId: context.studyId,
                ...(context.projectId ? { projectId: context.projectId } : {}),
            }
            : context.projectId
                ? {
                    status: "active" as const,
                    projectId: context.projectId,
                }
                : null;

        if (studyWhere) {
            const studyMemories = await prisma.studyMemory.findMany({
                where: studyWhere,
                orderBy: { updatedAt: "desc" },
                take: MAX_STUDY_SCOPE_MEMORIES,
            });

            for (const memory of studyMemories) {
                const content = normalizeText(
                    `[${memory.type}${memory.category ? ` - ${memory.category}` : ""}] ${memory.content}`,
                );
                collected.push({
                    memoryType: "study",
                    memoryId: memory.id,
                    userId: null,
                    projectId: memory.projectId,
                    studyId: memory.studyId,
                    domainType: memory.type,
                    content,
                    tags: memory.tags,
                    contentHash: contentHash(content),
                });
            }
        }
    }

    const deduped = new Map<string, ScopeMemory>();
    for (const memory of collected) {
        const key = `${memory.memoryType}:${memory.memoryId}`;
        if (!deduped.has(key)) {
            deduped.set(key, memory);
        }
    }

    return [...deduped.values()].slice(0, MAX_SCOPE_MEMORIES);
}

async function fetchExistingHashes(candidates: ScopeMemory[]): Promise<Map<string, string>> {
    if (candidates.length === 0) return new Map();

    const keyFilters = candidates.map((candidate) => Prisma.sql`("memoryType" = ${candidate.memoryType} AND "memoryId" = ${candidate.memoryId})`);
    const rows = await prisma.$queryRaw<Array<{ memoryType: string; memoryId: string; contentHash: string }>>`
        SELECT "memoryType", "memoryId", "contentHash"
        FROM "MemoryEmbedding"
        WHERE "model" = ${EMBEDDING_MODEL}
          AND (${Prisma.join(keyFilters, " OR ")})
    `;

    return new Map(rows.map((row) => [`${row.memoryType}:${row.memoryId}`, row.contentHash]));
}

async function upsertEmbedding(candidate: ScopeMemory, embedding: number[]): Promise<void> {
    const vector = embeddingLiteral(embedding);
    await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "MemoryEmbedding" (
            "id",
            "memoryType",
            "memoryId",
            "userId",
            "projectId",
            "studyId",
            "model",
            "contentHash",
            "sourceText",
            "embedding",
            "createdAt",
            "updatedAt"
        )
        VALUES (
            ${crypto.randomUUID()},
            ${candidate.memoryType},
            ${candidate.memoryId},
            ${candidate.userId},
            ${candidate.projectId},
            ${candidate.studyId},
            ${EMBEDDING_MODEL},
            ${candidate.contentHash},
            ${candidate.content},
            ${vector}::vector,
            NOW(),
            NOW()
        )
        ON CONFLICT ("memoryType", "memoryId", "model")
        DO UPDATE SET
            "contentHash" = EXCLUDED."contentHash",
            "sourceText" = EXCLUDED."sourceText",
            "embedding" = EXCLUDED."embedding",
            "userId" = EXCLUDED."userId",
            "projectId" = EXCLUDED."projectId",
            "studyId" = EXCLUDED."studyId",
            "updatedAt" = NOW()
    `);
}

async function ensureScopeEmbeddings(candidates: ScopeMemory[]): Promise<void> {
    if (candidates.length === 0) return;

    const client = getOpenAIClient();
    if (!client) return;

    const existingHashes = await fetchExistingHashes(candidates);
    const missing = candidates.filter((candidate) => {
        const existing = existingHashes.get(`${candidate.memoryType}:${candidate.memoryId}`);
        return existing !== candidate.contentHash;
    });

    if (missing.length === 0) return;

    for (const batch of chunk(missing, EMBEDDING_BATCH_SIZE)) {
        const inputs = batch.map((candidate) => candidate.content.slice(0, 8000));
        const response = await createEmbeddingsWithRetry(client, inputs);

        for (let i = 0; i < batch.length; i += 1) {
            const candidate = batch[i];
            const row = response.data[i];
            if (!candidate || !row?.embedding) continue;
            await upsertEmbedding(candidate, row.embedding);
        }
    }
}

async function countOutdated(candidates: ScopeMemory[]): Promise<number> {
    if (candidates.length === 0) return 0;
    const existingHashes = await fetchExistingHashes(candidates);
    return candidates.filter((candidate) => {
        const existing = existingHashes.get(`${candidate.memoryType}:${candidate.memoryId}`);
        return existing !== candidate.contentHash;
    }).length;
}

async function querySemanticScores(
    context: SemanticMemoryContext,
    options: SemanticMemoryOptions,
    queryEmbedding: number[],
): Promise<SemanticScoreRow[]> {
    const scopeClauses: Prisma.Sql[] = [];

    if (options.includeUser) {
        scopeClauses.push(Prisma.sql`("memoryType" = 'user' AND "userId" = ${context.userId})`);
    }

    if (options.includeProject && context.projectId) {
        scopeClauses.push(Prisma.sql`("memoryType" = 'project' AND "projectId" = ${context.projectId})`);
    }

    if (options.includeStudy) {
        if (context.studyId) {
            if (context.projectId) {
                scopeClauses.push(
                    Prisma.sql`("memoryType" = 'study' AND "projectId" = ${context.projectId} AND "studyId" = ${context.studyId})`,
                );
            } else {
                scopeClauses.push(
                    Prisma.sql`("memoryType" = 'study' AND "studyId" = ${context.studyId})`,
                );
            }
        } else if (context.projectId) {
            scopeClauses.push(
                Prisma.sql`("memoryType" = 'study' AND "projectId" = ${context.projectId})`,
            );
        }
    }

    if (scopeClauses.length === 0) return [];

    const queryVector = embeddingLiteral(queryEmbedding);
    return prisma.$queryRaw<SemanticScoreRow[]>`
        SELECT
            "memoryType",
            "memoryId",
            1 - ("embedding" <=> ${queryVector}::vector) AS "score"
        FROM "MemoryEmbedding"
        WHERE "model" = ${EMBEDDING_MODEL}
          AND (${Prisma.join(scopeClauses, " OR ")})
        ORDER BY "embedding" <=> ${queryVector}::vector ASC
        LIMIT ${MAX_SEMANTIC_RESULTS}
    `;
}

async function hydrateSemanticRows(
    rows: SemanticScoreRow[],
    context: SemanticMemoryContext,
    options: SemanticMemoryOptions,
    excludeIds: Set<string>,
): Promise<SemanticRetrievedMemory[]> {
    const scores = new Map<string, number>();
    const userIds: string[] = [];
    const projectIds: string[] = [];
    const studyIds: string[] = [];

    for (const row of rows) {
        if (excludeIds.has(row.memoryId)) continue;
        const key = `${row.memoryType}:${row.memoryId}`;
        const current = scores.get(key) ?? 0;
        scores.set(key, Math.max(current, clampRelevance(toScore(row.score))));
        if (row.memoryType === "user") userIds.push(row.memoryId);
        if (row.memoryType === "project") projectIds.push(row.memoryId);
        if (row.memoryType === "study") studyIds.push(row.memoryId);
    }

    const results: SemanticRetrievedMemory[] = [];

    if (options.includeUser && userIds.length > 0) {
        const userMemories = await prisma.userMemory.findMany({
            where: {
                id: { in: [...new Set(userIds)] },
                userId: context.userId,
                status: "active",
            },
        });

        for (const memory of userMemories) {
            const relevance = scores.get(`user:${memory.id}`) ?? 0;
            results.push({
                id: memory.id,
                type: "user",
                memoryType: memory.type,
                content: `${memory.key}: ${memory.value}${memory.rationale ? ` (${memory.rationale})` : ""}`,
                relevance,
                updatedAt: memory.updatedAt.toISOString(),
                tags: memory.tags,
            });
        }
    }

    if (options.includeProject && context.projectId && projectIds.length > 0) {
        const projectMemories = await prisma.projectMemory.findMany({
            where: {
                id: { in: [...new Set(projectIds)] },
                projectId: context.projectId,
                status: "active",
            },
        });

        for (const memory of projectMemories) {
            const relevance = scores.get(`project:${memory.id}`) ?? 0;
            results.push({
                id: memory.id,
                type: "project",
                memoryType: memory.type,
                content: `[${memory.type}${memory.category ? ` - ${memory.category}` : ""}] ${memory.statement}${memory.rationale ? ` | Rationale: ${memory.rationale}` : ""}`,
                relevance,
                updatedAt: memory.updatedAt.toISOString(),
                tags: memory.tags,
            });
        }
    }

    if (options.includeStudy && studyIds.length > 0) {
        const studyMemories = await prisma.studyMemory.findMany({
            where: {
                id: { in: [...new Set(studyIds)] },
                status: "active",
                ...(context.projectId ? { projectId: context.projectId } : {}),
                ...(context.studyId ? { studyId: context.studyId } : {}),
            },
        });

        for (const memory of studyMemories) {
            const relevance = scores.get(`study:${memory.id}`) ?? 0;
            results.push({
                id: memory.id,
                type: "study",
                memoryType: memory.type,
                content: `[${memory.type}${memory.category ? ` - ${memory.category}` : ""}] ${memory.content}`,
                relevance: clampRelevance(relevance * (memory.confidence ?? 1)),
                updatedAt: memory.updatedAt.toISOString(),
                source: memory.source || undefined,
                tags: memory.tags,
            });
        }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
}

export async function searchSemanticMemories(
    context: SemanticMemoryContext,
    options: SemanticMemoryOptions,
    excludeIds: Set<string>,
): Promise<SemanticRetrievedMemory[]> {
    const query = normalizeText(context.query || "");
    if (!query) return [];
    if (!getOpenAIClient()) return [];

    try {
        const scopeMemories = await collectScopeMemories(context, options);
        await ensureScopeEmbeddings(scopeMemories);

        const response = await createEmbeddingsWithRetry(getOpenAIClient()!, query.slice(0, 8000));
        const queryEmbedding = response.data[0]?.embedding;
        if (!queryEmbedding) return [];

        const scoreRows = await querySemanticScores(context, options, queryEmbedding);
        const hydrated = await hydrateSemanticRows(scoreRows, context, options, excludeIds);
        return hydrated.filter((memory) => memory.relevance >= options.minRelevance);
    } catch (error) {
        // Semantic retrieval is a ranking enhancement, never a hard dependency.
        logServerError("memory", "semantic retrieval failed; falling back to lexical ranking", {
            projectId: context.projectId ?? null,
            studyId: context.studyId ?? null,
        }, error);
        return [];
    }
}

export async function warmupSemanticEmbeddings(
    context: Omit<SemanticMemoryContext, "query">,
    options: Omit<SemanticMemoryOptions, "minRelevance"> = {
        includeUser: true,
        includeProject: true,
        includeStudy: true,
    },
): Promise<SemanticWarmupResult> {
    const scopeMemories = await collectScopeMemories(context, {
        minRelevance: 0,
        includeUser: options.includeUser,
        includeProject: options.includeProject,
        includeStudy: options.includeStudy,
    });
    const indexed = await countOutdated(scopeMemories);
    await ensureScopeEmbeddings(scopeMemories);
    return {
        scanned: scopeMemories.length,
        indexed,
        model: EMBEDDING_MODEL,
    };
}

export async function validateSemanticRolloutStatus(): Promise<SemanticRolloutStatus> {
    try {
        const extensionRows = await prisma.$queryRaw<Array<{ installed: boolean }>>`
            SELECT EXISTS (
                SELECT 1 FROM pg_extension WHERE extname = 'vector'
            ) AS installed
        `;
        const tableRows = await prisma.$queryRaw<Array<{ present: boolean }>>`
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'MemoryEmbedding'
            ) AS present
        `;

        const extensionInstalled = !!extensionRows[0]?.installed;
        const embeddingTablePresent = !!tableRows[0]?.present;

        let hnswIndexPresent = false;
        let totalEmbeddings = 0;

        if (embeddingTablePresent) {
            const indexRows = await prisma.$queryRaw<Array<{ present: boolean }>>`
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = 'MemoryEmbedding'
                      AND indexname = 'MemoryEmbedding_embedding_hnsw_idx'
                ) AS present
            `;
            hnswIndexPresent = !!indexRows[0]?.present;

            const embeddingCountRows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
                SELECT COUNT(*)::bigint AS count FROM "MemoryEmbedding"
            `;
            const totalEmbeddingsRaw = embeddingCountRows[0]?.count ?? 0;
            const parsed = typeof totalEmbeddingsRaw === "bigint"
                ? Number(totalEmbeddingsRaw)
                : Number(totalEmbeddingsRaw);
            totalEmbeddings = Number.isFinite(parsed) ? parsed : 0;
        }

        return {
            extensionInstalled,
            embeddingTablePresent,
            hnswIndexPresent,
            totalEmbeddings,
            model: EMBEDDING_MODEL,
            healthy: extensionInstalled && embeddingTablePresent && hnswIndexPresent,
        };
    } catch (error) {
        logServerError("memory", "semantic rollout validation failed", undefined, error);
        return {
            extensionInstalled: false,
            embeddingTablePresent: false,
            hnswIndexPresent: false,
            totalEmbeddings: 0,
            model: EMBEDDING_MODEL,
            healthy: false,
        };
    }
}
