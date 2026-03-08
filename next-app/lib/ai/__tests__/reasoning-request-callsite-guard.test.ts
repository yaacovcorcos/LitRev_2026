import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("reasoning request call-site guard", () => {
  it("keeps direct budget assembly out of request builders", () => {
    const projectCopilotSource = readFileSync(resolve(process.cwd(), "hooks/useCopilotStreamActions.ts"), "utf8");
    const aiPageSource = readFileSync(resolve(process.cwd(), "app/ai/page.tsx"), "utf8");

    expect(projectCopilotSource).not.toContain("getReasoningBudgetTokens(");
    expect(projectCopilotSource).not.toContain("shouldRequestReasoning(");
    expect(aiPageSource).not.toContain("getReasoningBudgetTokens(");
    expect(aiPageSource).not.toContain("shouldRequestReasoning(");
  });
});
