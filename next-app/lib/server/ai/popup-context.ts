import { prisma } from "@/lib/server/prisma";
import { retrieveMemories, formatMemoriesForContext } from "@/lib/server/memory";
import {
    AGENT_MODE_PROMPTS,
    buildProjectContext,
    buildProtocolContext,
    buildLedgerContext,
    buildLocationContext,
    buildStudyContext,
    sanitizeContext,
} from "@/lib/ai/prompts/copilot-prompts";
import { computeLedgerCounts } from "@/lib/server/ledger-utils";
import type { PopupChatContext } from "@/types/popup-chat";
import type { ProtocolData } from "@/types/protocol";

const POPUP_MEMORY_TIMEOUT_MS = 220;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
    });
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
}

function buildPopupSpecificContext(popupContext: PopupChatContext): string {
    switch (popupContext.type) {
        case "protocol_section":
            return `\n\n[ADDITIONAL_CONTEXT]\nSection: ${sanitizeContext(popupContext.section)}\n${sanitizeContext(popupContext.currentContent, 800)}`;
        case "criterion":
            return `\n\n[ADDITIONAL_CONTEXT]\nCriterion (${popupContext.criterionType}): ${sanitizeContext(popupContext.text, 800)}`;
        case "draft_selection":
            return `\n\n[ADDITIONAL_CONTEXT]\nDraft section: ${sanitizeContext(popupContext.section)}\nSelected text: ${sanitizeContext(popupContext.selectedText, 900)}`;
        case "study":
            return buildStudyContext({
                id: popupContext.studyId,
                title: popupContext.title,
                authors: popupContext.authors ?? "",
                year: 0,
                quality: "-",
                abstract: popupContext.abstract,
            });
    }
}

export function buildPopupModeInstruction(): string {
    return "\n\n[POPUP_MODE]\nThis is the mini-popup assistant. Keep answers concise and focused. Do not call mutation tools here. If the user wants to change the protocol or apply an edit, explain the recommended change briefly and direct them to Continue in Copilot to review or apply it in the main copilot surface.";
}

export async function buildPopupSystemPrompt(params: {
    popupContext: PopupChatContext;
    userId: string;
    workspaceId: string;
    userQuery: string;
    page?: string;
    section?: string;
}): Promise<string> {
    const { popupContext, userId, workspaceId, userQuery, page, section } = params;
    const projectId = popupContext.projectId;

    const [project, protocolRow, ledgerCounts, memories] = await Promise.all([
        prisma.project.findFirst({
            where: { id: projectId, ownerId: userId, workspaceId },
            select: { id: true, name: true },
        }),
        prisma.protocol.findFirst({ where: { projectId }, select: { data: true } }),
        computeLedgerCounts(projectId),
        withTimeout(
            retrieveMemories(
                {
                    userId,
                    projectId,
                    conversationId: `popup:${projectId}`,
                    query: userQuery,
                    agentMode: "general",
                },
                {
                    maxMemories: 3,
                    memoryBudgetTokens: 400,
                    includeStudy: popupContext.type === "study",
                },
            ),
            POPUP_MEMORY_TIMEOUT_MS,
            [],
        ),
    ]);

    const base = AGENT_MODE_PROMPTS.general;
    const projectContext = project ? buildProjectContext(project.name, project.id) : "";
    const protocolContext = protocolRow?.data
        ? buildProtocolContext(protocolRow.data as unknown as ProtocolData)
        : "";
    const ledgerContext = buildLedgerContext(ledgerCounts);
    const locationContext = buildLocationContext(page, section);
    const memoryContext = memories.length > 0 ? formatMemoriesForContext(memories) : "";
    const popupContextBlock = buildPopupSpecificContext(popupContext);

    return [
        base,
        buildPopupModeInstruction(),
        projectContext,
        protocolContext,
        ledgerContext,
        locationContext,
        memoryContext,
        popupContextBlock,
    ].filter(Boolean).join("");
}
