import { describe, expect, it } from "vitest";
import { buildPopupModeInstruction } from "@/lib/server/ai/popup-context";

describe("popup context prompt", () => {
    it("keeps popup edit intents advisory-only", () => {
        const instruction = buildPopupModeInstruction();

        expect(instruction).toContain("Do not call mutation tools here.");
        expect(instruction).toContain("Continue in Copilot");
        expect(instruction).not.toContain("call update_protocol");
    });
});
