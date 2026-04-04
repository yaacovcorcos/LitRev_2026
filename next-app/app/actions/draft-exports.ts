"use server";

import { z } from "zod";
import type { DraftStateInput } from "@/lib/draft-storage";
import type { FileAsset } from "@/types/files";
import { withAuth } from "@/lib/server/auth/session";
import { sanitizeErrorMessage } from "@/lib/server/action-utils";
import { projectIdSchema } from "@/lib/schemas/ids";
import { draftStateSchema, normalizeDraftStateInput } from "@/lib/schemas/drafts";
import { generateDraftExport } from "@/lib/server/draft-exports";

const draftExportOptionsSchema = z.object({
  format: z.enum(["docx", "markdown"]),
  mode: z.enum(["warn", "strict"]),
});

const generateDraftExportInput = z.object({
  projectId: projectIdSchema,
  draftSnapshot: z.preprocess(normalizeDraftStateInput, draftStateSchema),
  options: draftExportOptionsSchema,
});

export async function generateDraftExportAction(
  projectId: string,
  draftSnapshot: DraftStateInput,
  options: { format: "docx" | "markdown"; mode: "warn" | "strict" }
): Promise<{ success: true; data: FileAsset } | { success: false; error: string }> {
  try {
    const validated = generateDraftExportInput.parse({ projectId, draftSnapshot, options });
    const file = await withAuth(({ userId, workspaceId }) =>
      generateDraftExport(
        { ownerId: userId, workspaceId },
        validated.projectId,
        validated.draftSnapshot as DraftStateInput,
        validated.options,
      ),
    );
    return {
      success: true,
      data: file,
    };
  } catch (error) {
    return {
      success: false,
      error: sanitizeErrorMessage(error, "Failed to export draft", { allowRawMessage: true }),
    };
  }
}
