import type { ToolMiddleware } from "@/lib/server/ai/tool-middleware";
import type { ToolExecutionContext } from "@/lib/server/ai/tools/base";
import type { PopupChatContext } from "@/types/popup-chat";

const POPUP_READ_TOOLS = ["read_protocol", "read_ledger", "inspect_memory"] as const;
const POPUP_APPROVAL_TOOLS = ["update_protocol"] as const;

export const POPUP_ALLOWED_TOOLS = [...POPUP_READ_TOOLS, ...POPUP_APPROVAL_TOOLS] as const;

const POPUP_SECTION_FIELD_ALLOWLIST: Record<string, string[]> = {
    "research-question": ["researchQuestion"],
    "pico-framework": [
        "pico.population",
        "pico.intervention",
        "pico.comparison",
        "pico.outcome",
    ],
    "eligibility-criteria": ["eligibility.inclusion", "eligibility.exclusion"],
    "search-strategy": ["searchStrategy.query", "searchStrategy.databases"],
    methodology: [
        "methodology.studyDesigns",
        "methodology.timeFrameStart",
        "methodology.timeFrameEnd",
        "methodology.qualityAssessmentTool",
        "methodology.qualityAssessmentNotes",
    ],
};

function normalizeProtocolSection(sectionKey: string | undefined): string | null {
    if (!sectionKey) return null;
    if (sectionKey.startsWith("pico-")) return "pico-framework";
    if (sectionKey.startsWith("eligibility-")) return "eligibility-criteria";
    if (sectionKey.startsWith("search-")) return "search-strategy";
    if (sectionKey.startsWith("methodology-")) return "methodology";
    return sectionKey;
}

function getAllowedProtocolFieldsForContext(context: PopupChatContext): string[] {
    if (context.type === "criterion") {
        return context.criterionType === "inclusion"
            ? ["eligibility.inclusion"]
            : ["eligibility.exclusion"];
    }
    if (context.type !== "protocol_section") return [];

    const normalized = normalizeProtocolSection(context.sectionKey);
    if (!normalized) return [];
    return POPUP_SECTION_FIELD_ALLOWLIST[normalized] ?? [];
}

function getProjectId(context: PopupChatContext | null | undefined): string | null {
    if (!context) return null;
    return context.projectId;
}

export function createPopupToolGuard(params: {
    popupContext: PopupChatContext;
    projectId: string;
}): ToolMiddleware {
    return {
        name: "popup-tool-guard",
        before: (request) => {
            if (!POPUP_ALLOWED_TOOLS.includes(request.name as (typeof POPUP_ALLOWED_TOOLS)[number])) {
                return {
                    ...request,
                    shortCircuitResult: {
                        callId: request.callId,
                        result: null,
                        error: `Tool \"${request.name}\" is not allowed in popup mode.`,
                    },
                };
            }

            const ctxProjectId = getProjectId(params.popupContext);
            if (!ctxProjectId || ctxProjectId !== params.projectId) {
                return {
                    ...request,
                    shortCircuitResult: {
                        callId: request.callId,
                        result: null,
                        error: "Popup context project mismatch.",
                    },
                };
            }

            if (request.name === "update_protocol") {
                const field = typeof request.args.field === "string" ? request.args.field : "";
                const allowedFields = getAllowedProtocolFieldsForContext(params.popupContext);
                if (!allowedFields.includes(field)) {
                    return {
                        ...request,
                        shortCircuitResult: {
                            callId: request.callId,
                            result: null,
                            error: `Field \"${field}\" is outside the current popup section scope.`,
                        },
                    };
                }
            }

            const nextContext: ToolExecutionContext = {
                ...(request.context ?? {}),
                projectId: params.projectId,
            };

            return {
                ...request,
                context: nextContext,
            };
        },
    };
}

export function getAllowedPopupToolNames(): string[] {
    return [...POPUP_ALLOWED_TOOLS];
}

export function getAllowedPopupFields(context: PopupChatContext): string[] {
    return getAllowedProtocolFieldsForContext(context);
}
