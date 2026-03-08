import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("clarification contract prompt guards", () => {
  it("keeps ask_user as the only blocking clarification primitive in BASE_PROMPT", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/ai/prompts/copilot-prompts.ts"), "utf8");

    expect(source).toContain("use the ask_user tool to ask a structured question");
    expect(source).toContain("need a user preference or decision before continuing");
    expect(source).toContain("Do not use freeform prose or suggestion chips as a substitute for required clarification.");
    expect(source).not.toContain("For lightweight end-of-response suggestions, you may still use the <choices> block.");
  });

  it("keeps <choices> guidance scoped to optional suggestions in streamChatWithArtifacts", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/server/ai/ai-service.ts"), "utf8");

    expect(source).toContain("When suggesting optional next steps that the user can click for convenience");
    expect(source).toContain("Do not use <choices> for blocking questions or required decisions.");
    expect(source).toContain("If you need the user's answer before continuing, use ask_user instead.");
  });
});
