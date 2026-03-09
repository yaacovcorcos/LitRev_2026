import type { ToolMiddleware } from "@/lib/server/ai/tool-middleware";
import type { ToolExecutionContext } from "@/lib/server/ai/tools/base";
import type { PopupChatContext } from "@/types/popup-chat";

const POPUP_READ_TOOLS = ["read_protocol", "read_ledger", "inspect_memory"] as const;
export const POPUP_ALLOWED_TOOLS = [...POPUP_READ_TOOLS] as const;

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
