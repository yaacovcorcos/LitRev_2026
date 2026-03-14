import { z } from "zod";
import { normalizeDraftState } from "@/lib/draftStorage";

/**
 * Normalize unknown draft payloads into JSON-safe data before validation.
 * This strips runtime-only values (for example functions leaked from editor attrs).
 */
export function normalizeDraftStateInput(input: unknown): unknown {
  try {
    return JSON.parse(
      JSON.stringify(input, (_key, value) => {
        if (typeof value === "function" || typeof value === "symbol" || typeof value === "undefined") {
          return undefined;
        }
        if (typeof value === "number" && !Number.isFinite(value)) {
          return null;
        }
        return value;
      }),
    );
  } catch {
    return input;
  }
}

/** Recursive JSONContent (TipTap editor content) */
export const jsonContentSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(jsonContentSchema).optional(),
    marks: z
      .array(
        z.object({
          type: z.string(),
          attrs: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional(),
    text: z.string().optional(),
  }),
);

export const draftSectionFormatSchema = z.object({
  fontSize: z.number(),
  lineHeight: z.number(),
  paragraphSpacing: z.number(),
  fontFamily: z.string(),
});

export const draftPanelsStateSchema = z.object({
  ledgerWidth: z.number(),
  copilotWidth: z.number(),
  ledgerCollapsed: z.boolean(),
  copilotCollapsed: z.boolean(),
});

export const manuscriptSectionMetaSchema = z.object({
  sectionId: z.string(),
  sectionNodeId: z.string(),
  kind: z.enum(["base", "custom", "freeform"]),
  label: z.string(),
  placeholder: z.string().optional(),
});

export const manuscriptDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  doc: jsonContentSchema,
  sections: z.array(manuscriptSectionMetaSchema),
});

export const draftStateV1Schema = z.object({
  version: z.literal(1),
  mode: z.enum(["section", "full"]),
  activeSection: z.string().nullable(),
  sectionOrder: z.array(z.string()),
  customSections: z.record(
    z.string(),
    z.object({
      label: z.string(),
      placeholder: z.string().optional(),
    }),
  ),
  formattingBySection: z.record(z.string(), draftSectionFormatSchema),
  panels: draftPanelsStateSchema,
  contentBySection: z.record(z.string(), jsonContentSchema),
  ledgerBySection: z.record(z.string(), z.array(z.string())),
  copilotBySection: z.record(z.string(), z.array(z.unknown())),
});

export const draftStateV2Schema = draftStateV1Schema.extend({
  version: z.literal(2),
  manuscript: manuscriptDocumentSchema,
});

export const draftStateSchema = z
  .union([draftStateV2Schema, draftStateV1Schema])
  .transform((input) => normalizeDraftState(input));
