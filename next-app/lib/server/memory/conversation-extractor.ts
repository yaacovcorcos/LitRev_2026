/**
 * Conversation Memory Extraction
 * Extracts decisions, preferences, and facts from longer conversations (planC Phase 5.3)
 */

import "server-only";
import { createHash } from "crypto";
import { normalizeAssistantContent } from "@/lib/ai/normalize-assistant-content";
import { prisma } from "@/lib/server/prisma";
import { getAIService } from "@/lib/server/ai";
import type { AIMessage } from "@/types/ai";
import { getBackgroundModel } from "@/lib/server/ai/background-model-policy";
import type { MemoryProposalPayload } from "@/types/artifacts";
import type { ProjectMemoryCategory, ProjectMemoryType } from "./project-memory";
import { createArtifact } from "@/lib/server/agent/artifacts";
import { createAbortError, throwIfAborted } from "@/lib/abort";

const VALID_CATEGORIES: ProjectMemoryCategory[] = [
    "inclusion", "exclusion", "outcome", "population", "intervention", "comparison",
];

const EXTRACTION_PROMPT = `You are analyzing a conversation between a researcher and an AI assistant about a systematic literature review. Extract actionable memories.

Return ONLY valid JSON:
{
  "decisions": [
    { "statement": "...", "category": "...", "rationale": "..." }
  ],
  "preferences": [
    { "key": "...", "value": "...", "rationale": "..." }
  ],
  "facts": [
    { "statement": "...", "category": "..." }
  ]
}

Rules:
- "decisions": explicit user decisions (e.g., "let's exclude case studies"). If the user agrees with an AI suggestion (e.g., "yeah that makes sense" or "go ahead"), that counts as a decision — attribute it to the user. Also capture what the user explicitly rejected as a decision with "Rejected: ..." prefix (e.g., "Rejected: including grey literature").
- "preferences": inferred user preferences about workflow or style. Use consistent keys like "writing_style", "citation_format", "response_length", "search_scope".
- "facts": domain-specific facts the user stated (e.g., "the primary outcome is mortality at 30 days")
- "category" for decisions/facts: one of "inclusion", "exclusion", "outcome", "population", "intervention", "comparison", or null
- If nothing is extractable, return empty arrays
- Keep statements concise (under 250 characters)`;

const SCOPING_TRANSIENT_PATTERNS = [
    /\bliterature landscape\b/i,
    /\bevidence density\b/i,
    /\bevidence gaps?\b/i,
    /\bmajor themes?\b/i,
    /\bmethodological patterns?\b/i,
    /\bsearch(?:es)? (?:run|results?|yielded)\b/i,
    /\brecommended questions?\b/i,
];

function buildExtractionPrompt(isScopingConversation: boolean): string {
    if (!isScopingConversation) return EXTRACTION_PROMPT;
    return `${EXTRACTION_PROMPT}

Scoping-specific guardrails:
- Only extract explicit user decisions or explicit user preferences.
- Do NOT extract transient scoping summaries (themes, gaps, evidence density, search counts, or recommended question lists) as memories.
- If unsure whether something is an explicit user decision, leave it out.`;
}

function isScopingConversation(messages: { role: string; content: string }[]): boolean {
    return messages.some((m) =>
        m.role === "assistant" &&
        normalizeAssistantContent(m.content).hiddenBlocks.some((block) => block.type === "scoping_report"),
    );
}

function sanitizeTranscriptContent(role: string, content: string): string {
    if (role === "assistant") return normalizeAssistantContent(content).displayContent.trim();
    return content.trim();
}

function looksTransientScopingSummary(statement: string): boolean {
    return SCOPING_TRANSIENT_PATTERNS.some((pattern) => pattern.test(statement));
}

function proposalSourceEventId(extractionMarker: string, kind: string, content: string): string {
    const normalized = `${kind}:${content.trim().toLowerCase().replace(/\s+/g, " ")}`;
    const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
    return `${extractionMarker}:${kind}:${digest}`;
}

export interface ExtractionResult {
    decisions: { statement: string; category?: string; rationale?: string }[];
    preferences: { key: string; value: string; rationale?: string }[];
    facts: { statement: string; category?: string }[];
}

const EMPTY_RESULT: ExtractionResult = { decisions: [], preferences: [], facts: [] };

async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    throwIfAborted(signal);
    if (!signal) return promise;

    let removeAbortListener = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
        const onAbort = () => reject(createAbortError());
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
        if (signal.aborted) onAbort();
    });
    try {
        return await Promise.race([promise, aborted]);
    } finally {
        removeAbortListener();
    }
}

/**
 * Extract memories from a completed conversation using a lightweight AI model.
 * Inferred memories are proposed for review instead of silently becoming durable truth.
 */
export async function extractMemoriesFromConversation(
    conversationId: string,
    projectId: string,
    runId?: string,
    userId?: string,
    options?: { signal?: AbortSignal },
): Promise<ExtractionResult> {
    throwIfAborted(options?.signal);
    const extractionMarker = `conversation-extractor:${conversationId}`;

    // 0. Legacy whole-conversation dedup guard. New extraction attempts use
    // per-proposal applyIds below; a prefix match here would mistake partial
    // proposal persistence for whole-job success and omit the remaining work.
    const [existingMemoryExtraction, existingLegacyProposalExtraction] = await Promise.all([
        prisma.projectMemory.findFirst({
            where: { projectId, tags: { has: `conversation:${conversationId}` } },
            select: { id: true },
        }),
        prisma.artifact.findFirst({
            where: {
                projectId,
                conversationId,
                type: "memory_proposal",
                sourceEventId: extractionMarker,
            },
            select: { id: true },
        }),
    ]);
    throwIfAborted(options?.signal);
    if (existingMemoryExtraction || existingLegacyProposalExtraction) return EMPTY_RESULT;

    // 1. Fetch conversation messages
    const messages = await prisma.aIMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
    });
    throwIfAborted(options?.signal);

    const scopingContext = isScopingConversation(messages);

    // Filter to substantive messages and sanitize hidden markup before extraction.
    const substantive = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
            role: m.role,
            content: sanitizeTranscriptContent(m.role, m.content),
        }))
        .filter((m) => m.content.length > 20);

    if (substantive.length < 5) return EMPTY_RESULT;

    // 2. Build transcript (cap at last 50 messages to avoid massive prompts)
    const capped = substantive.slice(-50);
    const transcript = capped
        .map((m) => `[${m.role}]: ${m.content.slice(0, 1000)}`)
        .join("\n\n");

    // 3. Call AI
    const aiService = getAIService();
    const aiMessages: AIMessage[] = [
        { id: "sys", role: "system", content: buildExtractionPrompt(scopingContext), createdAt: new Date().toISOString() },
        { id: "user", role: "user", content: `Conversation:\n\n${transcript}`, createdAt: new Date().toISOString() },
    ];

    const response = await raceWithAbort(
        aiService.chat(aiMessages, {
            model: getBackgroundModel("analysis"),
            reasoningEffort: "fast",
            temperature: 0.1,
            maxTokens: 1500,
            projectId,
            signal: options?.signal,
        }),
        options?.signal,
    );
    throwIfAborted(options?.signal);

    // 4. Parse JSON response
    let parsed: ExtractionResult;
    try {
        const cleaned = response.content
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
        parsed = JSON.parse(cleaned);
        // Validate shape
        if (!Array.isArray(parsed.decisions)) parsed.decisions = [];
        if (!Array.isArray(parsed.preferences)) parsed.preferences = [];
        if (!Array.isArray(parsed.facts)) parsed.facts = [];
        if (scopingContext) {
            parsed.facts = [];
            parsed.decisions = parsed.decisions.filter((d) => d.statement && !looksTransientScopingSummary(d.statement));
        }
    } catch {
        throwIfAborted(options?.signal);
        return EMPTY_RESULT;
    }

    throwIfAborted(options?.signal);

    if (!runId) {
        return parsed;
    }
    const reviewRunId = runId;

    async function createMemoryProposal(
        title: string,
        payload: MemoryProposalPayload,
        sourceEventId: string,
    ) {
        throwIfAborted(options?.signal);
        const existingProposal = await prisma.artifact.findFirst({
            where: {
                projectId,
                conversationId,
                type: "memory_proposal",
                sourceEventId,
            },
            select: { id: true },
        });
        throwIfAborted(options?.signal);
        if (existingProposal) return;

        await createArtifact({
            runId: reviewRunId,
            projectId,
            conversationId,
            userId,
            type: "memory_proposal",
            title,
            payload,
            sourceEventId,
            applyId: sourceEventId,
        });
    }

    async function proposeProjectMemory(
        payload: {
            title: string;
            sourceEventKind: string;
            statement: string;
            rationale?: string;
            category?: string;
            projectMemoryType: ProjectMemoryType;
            confidence: number;
        },
    ) {
        if (!payload.statement) return;
        const cat = VALID_CATEGORIES.includes(payload.category as ProjectMemoryCategory)
            ? (payload.category as ProjectMemoryCategory)
            : undefined;
        const proposalPayload: MemoryProposalPayload = {
            memoryType: "project",
            value: payload.statement,
            rationale: payload.rationale,
            projectMemoryType: payload.projectMemoryType,
            projectMemoryCategory: cat,
            confidence: payload.confidence,
        };
        await createMemoryProposal(
            payload.title,
            proposalPayload,
            proposalSourceEventId(extractionMarker, payload.sourceEventKind, payload.statement),
        );
    }

    // 5. Propose explicit decisions for review.
    for (const decision of parsed.decisions) {
        await proposeProjectMemory({
            title: "Memory proposal: conversation decision",
            sourceEventKind: "decision",
            statement: decision.statement,
            rationale: decision.rationale,
            category: decision.category,
            projectMemoryType: "decision",
            confidence: 0.65,
        });
    }

    // 6. Propose facts as definitions for review.
    for (const fact of parsed.facts) {
        await proposeProjectMemory({
            title: "Memory proposal: conversation fact",
            sourceEventKind: "fact",
            statement: fact.statement,
            category: fact.category,
            projectMemoryType: "definition",
            confidence: 0.55,
        });
    }

    // 7. Propose inferred preferences as memory_proposal artifacts.
    if (parsed.preferences.length > 0) {
        for (const pref of parsed.preferences) {
            if (!pref.key || !pref.value) continue;
            const payload: MemoryProposalPayload = {
                memoryType: "user",
                key: pref.key,
                value: pref.value,
                rationale: pref.rationale,
            };
            await createMemoryProposal(
                `Preference: ${pref.key}`,
                payload,
                proposalSourceEventId(extractionMarker, `preference:${pref.key}`, pref.value),
            );
        }
    }

    return parsed;
}
