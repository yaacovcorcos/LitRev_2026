 // @vitest-environment node
 import { describe, expect, it } from "vitest";
 import {
     getReasoningSupportTier,
     modelSupportsReasoning,
     USER_SELECTABLE_MODELS,
     type ReasoningSupportTier,
 } from "../config";
 
 describe("Reasoning support tiers", () => {
     describe("getReasoningSupportTier", () => {
         it("returns 'explicit' for Anthropic models", () => {
             expect(getReasoningSupportTier("claude-haiku-4-5")).toBe("explicit");
         });
 
         it("returns 'best_effort' for OpenAI and xAI reasoning models", () => {
             expect(getReasoningSupportTier("gpt-5.2")).toBe("best_effort");
             expect(getReasoningSupportTier("grok-4-1-fast")).toBe("best_effort");
         });
 
         it("returns 'none' for models without reasoning support", () => {
             expect(getReasoningSupportTier("gpt-5-mini")).toBe("none");
             expect(getReasoningSupportTier("gemini-3-flash-preview")).toBe("none");
         });
 
         it("returns 'none' for unknown models (safe default)", () => {
             expect(getReasoningSupportTier("unknown-model-xyz")).toBe("none");
         });
     });
 
     describe("modelSupportsReasoning", () => {
         it("returns true for explicit and best_effort tiers", () => {
             expect(modelSupportsReasoning("claude-haiku-4-5")).toBe(true);
             expect(modelSupportsReasoning("gpt-5.2")).toBe(true);
             expect(modelSupportsReasoning("grok-4-1-fast")).toBe(true);
         });
 
         it("returns false for none tier", () => {
             expect(modelSupportsReasoning("gpt-5-mini")).toBe(false);
             expect(modelSupportsReasoning("gemini-3-flash-preview")).toBe(false);
         });
 
         it("returns false for unknown models", () => {
             expect(modelSupportsReasoning("unknown-model")).toBe(false);
         });
     });
 
     describe("USER_SELECTABLE_MODELS configuration", () => {
         it("all models have a reasoningSupport property", () => {
             const validTiers: ReasoningSupportTier[] = ["explicit", "best_effort", "none"];
             for (const model of USER_SELECTABLE_MODELS) {
                 expect(validTiers).toContain(model.reasoningSupport);
             }
         });
 
         it("at least one model has explicit reasoning support", () => {
             const hasExplicit = USER_SELECTABLE_MODELS.some(
                 (m) => m.reasoningSupport === "explicit"
             );
             expect(hasExplicit).toBe(true);
         });
 
         it("at least one model has no reasoning support", () => {
             const hasNone = USER_SELECTABLE_MODELS.some(
                 (m) => m.reasoningSupport === "none"
             );
             expect(hasNone).toBe(true);
         });
     });
 });
