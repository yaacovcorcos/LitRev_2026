"use client";

import { useCallback } from "react";
import { useProjectConversation } from "@/contexts/ProjectConversationContext";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { getContextCaptureAction } from "@/lib/context-capture/actions";
import { isContextCaptureV1Enabled } from "@/lib/context-capture/feature-flags";
import { recordContextCaptureMetric } from "@/lib/context-capture/telemetry";
import { contextTargetToPopupContext, isPopupSafeContextTarget } from "@/lib/context-capture/targets";
import type { AgentMode } from "@/types/agent";
import type { CopilotPage } from "@/types/ai";
import type { ContextCaptureActionId, ContextCaptureTarget } from "@/types/context-capture";

type CopilotLaunchArgs = {
    targets: ContextCaptureTarget[];
    prompt: string;
    page: CopilotPage;
    section?: string;
    studyId?: string;
    agentMode?: AgentMode;
};

type ActionArgs = CopilotLaunchArgs & {
    actionId: ContextCaptureActionId;
};

type TelemetryMeta = {
    actionId?: ContextCaptureActionId | null;
    launchMode?: "popup" | "prefill" | "immediate_send" | "fallback_prefill";
};

export function useContextCaptureActions() {
    const captureEnabled = isContextCaptureV1Enabled();
    const { openPopupChat } = usePopupChat();
    const {
        setCollapsed,
        addAttachedContextTargets,
        clearAttachedContextTargets,
        queuePrefillCommand,
        sendMessage,
        recordContextHistory,
    } = useProjectConversation();

    const revealCopilot = useCallback(() => {
        setCollapsed(false);
    }, [setCollapsed]);

    const prefillCopilotWithTargets = useCallback((args: CopilotLaunchArgs, telemetry?: TelemetryMeta) => {
        revealCopilot();
        clearAttachedContextTargets();
        addAttachedContextTargets(args.targets);
        queuePrefillCommand(args.prompt);
        recordContextHistory(args.targets);
        recordContextCaptureMetric({
            type: "context_capture_opened",
            projectId: args.targets[0]?.projectId ?? null,
            payload: {
                surface: args.targets[0]?.sourceSurface ?? "copilot",
                targetKinds: args.targets.map((target) => target.kind),
                launchMode: telemetry?.launchMode ?? "prefill",
                actionId: telemetry?.actionId ?? null,
            },
        });
    }, [
        addAttachedContextTargets,
        clearAttachedContextTargets,
        queuePrefillCommand,
        recordContextHistory,
        revealCopilot,
    ]);

    const sendToCopilot = useCallback((args: CopilotLaunchArgs, telemetry?: TelemetryMeta) => {
        revealCopilot();
        clearAttachedContextTargets();
        void sendMessage(
            args.prompt,
            args.page,
            args.section,
            undefined,
            args.agentMode,
            args.studyId,
            undefined,
            args.targets,
        );
        recordContextCaptureMetric({
            type: "context_capture_sent",
            projectId: args.targets[0]?.projectId ?? null,
            payload: {
                surface: args.targets[0]?.sourceSurface ?? "copilot",
                targetKinds: args.targets.map((target) => target.kind),
                launchMode: telemetry?.launchMode ?? "immediate_send",
                actionId: telemetry?.actionId ?? null,
            },
        });
    }, [clearAttachedContextTargets, revealCopilot, sendMessage]);

    const openPopupForTarget = useCallback((target: ContextCaptureTarget, telemetry?: TelemetryMeta): boolean => {
        if (!captureEnabled) return false;
        const popupContext = contextTargetToPopupContext(target);
        if (!popupContext) return false;
        recordContextHistory([target]);
        recordContextCaptureMetric({
            type: "context_capture_opened",
            projectId: target.projectId,
            payload: {
                surface: target.sourceSurface ?? "popup",
                targetKinds: [target.kind],
                launchMode: telemetry?.launchMode ?? "popup",
                actionId: telemetry?.actionId ?? null,
            },
        });
        openPopupChat(popupContext);
        return true;
    }, [captureEnabled, openPopupChat, recordContextHistory]);

    const runAction = useCallback((args: ActionArgs) => {
        const action = getContextCaptureAction(args.actionId);
        const target = args.targets[0];
        if (!target) return;

        if (action.launchMode === "popup" && args.targets.length === 1 && isPopupSafeContextTarget(target)) {
            if (openPopupForTarget(target, { actionId: action.id, launchMode: "popup" })) return;
        }

        if (action.launchMode === "immediate_send") {
            sendToCopilot(args, { actionId: action.id, launchMode: "immediate_send" });
            return;
        }

        if (action.launchMode === "popup") {
            recordContextCaptureMetric({
                type: "context_capture_scope_mismatch",
                projectId: target.projectId,
                payload: {
                    surface: target.sourceSurface ?? args.page,
                    targetKinds: args.targets.map((item) => item.kind),
                    actionId: action.id,
                    launchMode: "fallback_prefill",
                    reason: "Popup-safe adapter unavailable for selected target.",
                },
            });
        }

        prefillCopilotWithTargets(args, {
            actionId: action.id,
            launchMode: action.launchMode === "popup" ? "fallback_prefill" : "prefill",
        });
    }, [openPopupForTarget, prefillCopilotWithTargets, sendToCopilot]);

    return {
        captureEnabled,
        openPopupForTarget,
        prefillCopilotWithTargets,
        sendToCopilot,
        runAction,
    };
}
