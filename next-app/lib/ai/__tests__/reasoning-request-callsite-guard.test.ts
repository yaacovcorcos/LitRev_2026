import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("reasoning request call-site guard", () => {
  it("keeps direct budget assembly out of request builders", () => {
    const projectConversationSource = readFileSync(resolve(process.cwd(), "hooks/useProjectConversationStreamActions.ts"), "utf8");
    const aiPageSource = readFileSync(resolve(process.cwd(), "app/ai/page.tsx"), "utf8");

    expect(projectConversationSource).not.toContain("getReasoningBudgetTokens(");
    expect(projectConversationSource).not.toContain("shouldRequestReasoning(");
    expect(aiPageSource).not.toContain("getReasoningBudgetTokens(");
    expect(aiPageSource).not.toContain("shouldRequestReasoning(");
  });
});
