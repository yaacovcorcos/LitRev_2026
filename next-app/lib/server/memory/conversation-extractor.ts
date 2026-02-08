/**
 * Conversation Memory Extraction
 * Extracts decisions, preferences, and facts from longer conversations (planC Phase 5.3)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import { getAIService } from "@/lib/server/ai";
import type { AIMessage } from "@/types/ai";
import type { MemoryProposalPayload } from "@/types/artifacts";
import { createProjectMemory, type ProjectMemoryCategory } from "./project-memory";
import { createArtifact } from "@/lib/server/agent/artifacts";

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

export interface ExtractionResult {
    decisions: { statement: string; category?: string; rationale?: string }[];
    preferences: { key: string; value: string; rationale?: string }[];
    facts: { statement: string; category?: string }[];
}

const EMPTY_RESULT: ExtractionResult = { decisions: [], preferences: [], facts: [] };

/**
 * Extract memories from a completed conversation using a lightweight AI model.
 * Decisions and facts are auto-stored. Preferences are proposed as memory_proposal artifacts.
 */
export async function extractMemoriesFromConversation(
    conversationId: string,
    projectId: string,
    runId?: string,
    userId?: string,
): Promise<ExtractionResult> {
    // 0. Dedup guard — skip if this conversation was already extracted
    const alreadyExtracted = await prisma.projectMemory.findFirst({
        where: { projectId, tags: { has: `conversation:${conversationId}` } },
        select: { id: true },
    });
    if (alreadyExtracted) return EMPTY_RESULT;

    // 1. Fetch conversation messages
    const messages = await prisma.aIMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
    });

    // Filter to substantive messages
    const substantive = messages.filter(
        (m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 20,
    );

    if (substantive.length < 5) return EMPTY_RESULT;

    // 2. Build transcript (cap at last 50 messages to avoid massive prompts)
    const capped = substantive.slice(-50);
    const transcript = capped
        .map((m) => `[${m.role}]: ${m.content.slice(0, 1000)}`)
        .join("\n\n");

    // 3. Call AI
    const aiService = getAIService();
    const aiMessages: AIMessage[] = [
        { id: "sys", role: "system", content: EXTRACTION_PROMPT, createdAt: new Date().toISOString() },
        { id: "user", role: "user", content: `Conversation:\n\n${transcript}`, createdAt: new Date().toISOString() },
    ];

    const response = await aiService.chat(aiMessages, {
        model: "grok-4-1-fast",
        temperature: 0.1,
        maxTokens: 1500,
        projectId,
    });

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
    } catch {
        return EMPTY_RESULT;
    }

    // 5. Auto-store explicit decisions
    for (const decision of parsed.decisions) {
        if (!decision.statement) continue;
        const cat = VALID_CATEGORIES.includes(decision.category as ProjectMemoryCategory)
            ? (decision.category as ProjectMemoryCategory) : undefined;
        await createProjectMemory({
            projectId,
            type: "decision",
            category: cat,
            statement: decision.statement,
            rationale: decision.rationale,
            importance: "important",
            tags: ["conversation-extracted", `conversation:${conversationId}`],
        });
    }

    // 6. Auto-store facts as definitions
    for (const fact of parsed.facts) {
        if (!fact.statement) continue;
        const cat = VALID_CATEGORIES.includes(fact.category as ProjectMemoryCategory)
            ? (fact.category as ProjectMemoryCategory) : undefined;
        await createProjectMemory({
            projectId,
            type: "definition",
            category: cat,
            statement: fact.statement,
            importance: "normal",
            tags: ["conversation-extracted", `conversation:${conversationId}`],
        });
    }

    // 7. Propose inferred preferences as memory_proposal artifacts
    if (parsed.preferences.length > 0 && runId) {
        for (const pref of parsed.preferences) {
            const payload: MemoryProposalPayload = {
                memoryType: "user",
                key: pref.key,
                value: pref.value,
                rationale: pref.rationale,
            };
            await createArtifact({
                runId,
                projectId,
                conversationId,
                userId,
                type: "memory_proposal",
                title: `Preference: ${pref.key}`,
                payload,
            });
        }
    }

    return parsed;
}
