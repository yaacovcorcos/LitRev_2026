"use server";

import { z } from "zod";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema } from "@/lib/schemas/ids";
import { executeDraftImport, type ExecuteDraftImportResult } from "@/lib/server/draft-imports";

const importFormatSchema = z.enum([
  "docx",
  "markdown",
  "html",
  "csv",
  "tsv",
  "csl-json",
  "ris",
  "bibtex",
  "legacy-draft",
]);

const draftImportPayloadSchema = z.object({
  format: importFormatSchema,
  filename: z.string().max(512).optional(),
  text: z.string().optional(),
  base64Bytes: z.string().min(1).max(20_000_000).optional(),
});

const draftImportActionInput = z.object({
  projectId: projectIdSchema,
  payload: draftImportPayloadSchema,
  mode: z.enum(["dry-run", "apply"]).default("dry-run"),
});

function decodeBase64Bytes(value: string | undefined): Uint8Array | undefined {
  if (!value) return undefined;
  return new Uint8Array(Buffer.from(value, "base64"));
}

export async function executeDraftImportAction(
  projectId: string,
  payload: z.infer<typeof draftImportPayloadSchema>,
  mode: "dry-run" | "apply" = "dry-run",
): Promise<ActionResult<ExecuteDraftImportResult>> {
  return withValidatedAction(
    draftImportActionInput,
    { projectId, payload, mode },
    async (input) =>
      withAuth(({ userId, workspaceId }) =>
        executeDraftImport(
          { ownerId: userId, workspaceId },
          {
            projectId: input.projectId,
            mode: input.mode,
            payload: {
              format: input.payload.format,
              filename: input.payload.filename,
              text: input.payload.text,
              bytes: decodeBase64Bytes(input.payload.base64Bytes),
            },
          },
        ),
      ),
  );
}
