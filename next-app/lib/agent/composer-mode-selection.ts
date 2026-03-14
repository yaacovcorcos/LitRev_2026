import type { AgentMode } from "@/types/agent";
import { routeToAgent, type RouterPage } from "@/lib/agent/router";

export type ComposerModeSelection =
    | { kind: "auto" }
    | { kind: "manual"; mode: AgentMode };

export const AUTO_COMPOSER_MODE_SELECTION: ComposerModeSelection = { kind: "auto" };

const PROTOCOL_SWITCH_INTENT_RE = /\b(?:switch|move|go|start|enter)\b[\w\s]{0,24}\bprotocol\b|\bprotocol mode\b|\bupdate protocol\b/i;

export function isManualComposerModeSelection(
    selection: ComposerModeSelection,
): selection is Extract<ComposerModeSelection, { kind: "manual" }> {
    return selection.kind === "manual";
}

export function resolveComposerAutoMode(params: {
    message: string;
    page: RouterPage;
    hasProtocol?: boolean;
    previousAutoMode?: AgentMode;
}): AgentMode {
    const trimmed = params.message.trim();
    const nextMode = routeToAgent(trimmed, params.page, { hasProtocol: params.hasProtocol });
    if (
        params.previousAutoMode === "scoping"
        && nextMode === "protocol"
        && !PROTOCOL_SWITCH_INTENT_RE.test(trimmed)
    ) {
        return "scoping";
    }

    return nextMode;
}

export function resolveComposerMode(params: {
    selection: ComposerModeSelection;
    message: string;
    page: RouterPage;
    hasProtocol?: boolean;
    previousAutoMode?: AgentMode;
}): AgentMode {
    if (isManualComposerModeSelection(params.selection)) {
        return params.selection.mode;
    }

    return resolveComposerAutoMode({
        message: params.message,
        page: params.page,
        hasProtocol: params.hasProtocol,
        previousAutoMode: params.previousAutoMode,
    });
}
