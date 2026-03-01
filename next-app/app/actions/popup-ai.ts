"use server";

import { z } from "zod";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import { ensureProtocol } from "@/lib/server/protocols";
import { isValidFieldPath, validateFieldValue } from "@/lib/protocol-fields";
import { getAllowedPopupFields } from "@/lib/server/ai/popup-tool-contract";
import type { PopupChatContext } from "@/types/popup-chat";

const popupContextSchema = z.object({
    type: z.enum(["study", "criterion", "draft_selection", "protocol_section"]),
    projectId: z.string().min(1),
    section: z.string().optional(),
    sectionKey: z.string().optional(),
    currentContent: z.string().optional(),
    text: z.string().optional(),
    criterionType: z.enum(["inclusion", "exclusion"]).optional(),
    selectedText: z.string().optional(),
    studyId: z.string().optional(),
    title: z.string().optional(),
    abstract: z.string().optional(),
    authors: z.string().optional(),
});

const applyProposalInput = z.object({
    projectId: z.string().min(1),
    popupContext: popupContextSchema,
    proposal: z.object({
        field: z.string().min(1),
        value: z.union([z.string(), z.array(z.string())]),
        rationale: z.string().min(1).max(1000).optional(),
    }),
});

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown) {
    const keys = path.split(".");
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i += 1) {
        const k = keys[i];
        if (typeof current[k] !== "object" || current[k] === null) {
            current[k] = {};
        }
        current = current[k] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]] = value;
}

function isPopupContext(value: z.infer<typeof popupContextSchema>): value is PopupChatContext {
    return Boolean(value.type && value.projectId);
}

async function assertProjectAccess(projectId: string, userId: string, workspaceId: string): Promise<void> {
    const project = await prisma.project.findFirst({
        where: { id: projectId, ownerId: userId, workspaceId },
        select: { id: true },
    });
    if (!project) throw new Error("Project not found or access denied");
}

export async function applyPopupProtocolProposalAction(
    projectId: string,
    popupContext: PopupChatContext,
    proposal: { field: string; value: string | string[]; rationale?: string },
): Promise<ActionResult<{ field: string; value: string | string[] }>> {
    return withValidatedAction(
        applyProposalInput,
        { projectId, popupContext, proposal },
        (input) => withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(input.projectId, userId, workspaceId);
            if (input.popupContext.projectId !== input.projectId) {
                throw new Error("Popup context project mismatch.");
            }
            if (!isValidFieldPath(input.proposal.field)) {
                throw new Error(`Invalid protocol field: ${input.proposal.field}`);
            }

            if (!isPopupContext(input.popupContext)) {
                throw new Error("Invalid popup context payload.");
            }

            const allowedFields = getAllowedPopupFields(input.popupContext);
            if (!allowedFields.includes(input.proposal.field)) {
                throw new Error("Field is outside the current popup section scope.");
            }

            const validated = validateFieldValue(input.proposal.field, input.proposal.value);
            if (!validated.valid) {
                throw new Error(validated.error);
            }

            const data = await ensureProtocol(input.projectId);
            setNestedValue(data as unknown as Record<string, unknown>, input.proposal.field, validated.value);

            await prisma.protocol.update({
                where: { projectId: input.projectId },
                data: { data: data as unknown as object },
            });

            return { field: input.proposal.field, value: validated.value };
        }),
    );
}

const logRejectInput = z.object({
    projectId: z.string().min(1),
    popupContext: popupContextSchema,
    field: z.string().min(1),
    reason: z.string().max(1000).optional(),
});

export async function logPopupProposalRejectedAction(
    projectId: string,
    popupContext: PopupChatContext,
    field: string,
    reason?: string,
): Promise<ActionResult<{ logged: true }>> {
    return withValidatedAction(
        logRejectInput,
        { projectId, popupContext, field, reason },
        (input) => withAuth(async ({ userId, workspaceId }) => {
            await assertProjectAccess(input.projectId, userId, workspaceId);
            console.info("[popup-ai] proposal_rejected", {
                projectId: input.projectId,
                popupType: input.popupContext.type,
                field: input.field,
                reason: input.reason ?? "rejected",
                at: new Date().toISOString(),
            });
            return { logged: true as const };
        }),
    );
}
