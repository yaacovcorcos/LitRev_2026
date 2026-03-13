import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createDefaultDraftState } from "@/lib/draftStorage";
import { draftStateSchema, normalizeDraftStateInput } from "@/lib/schemas/drafts";
import { projectIdSchema } from "@/lib/schemas/ids";

const saveDraftInputSchema = z.object({
  projectId: projectIdSchema,
  state: z.preprocess(normalizeDraftStateInput, draftStateSchema),
});

describe("draft save schema normalization", () => {
  it("strips non-serializable function attrs before validation", () => {
    const state = createDefaultDraftState();
    const abstractNode = (state.contentBySection.abstract as { content?: Array<{ attrs?: unknown }> }).content?.[0];
    if (!abstractNode) throw new Error("expected default abstract paragraph node");

    abstractNode.attrs = (() => "leak") as unknown;

    const parsed = saveDraftInputSchema.parse({
      projectId: "p1",
      state,
    });

    expect(parsed.state.version).toBe(2);
    expect(parsed.state.manuscript.schemaVersion).toBe(1);
    const parsedNode = (parsed.state.contentBySection.abstract as { content?: Array<{ attrs?: unknown }> }).content?.[0];
    expect(parsedNode?.attrs).toEqual({ blockId: expect.any(String) });
  });

  it("preserves valid attrs objects", () => {
    const state = createDefaultDraftState();
    const abstractNode = (state.contentBySection.abstract as { content?: Array<{ attrs?: unknown }> }).content?.[0];
    if (!abstractNode) throw new Error("expected default abstract paragraph node");

    abstractNode.attrs = { dir: "rtl" };

    const parsed = saveDraftInputSchema.parse({
      projectId: "p1",
      state,
    });

    expect(parsed.state.version).toBe(2);
    expect(parsed.state.manuscript.schemaVersion).toBe(1);
    const parsedNode = (parsed.state.contentBySection.abstract as { content?: Array<{ attrs?: unknown }> }).content?.[0];
    expect(parsedNode?.attrs).toMatchObject({ dir: "rtl", blockId: expect.any(String) });
  });
});
