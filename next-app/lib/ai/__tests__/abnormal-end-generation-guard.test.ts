import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("abnormal-end generation guards", () => {
  it("guards /ai abnormal-end cleanup behind current generation ownership", () => {
    const aiPageSource = readFileSync(resolve(process.cwd(), "app/ai/page.tsx"), "utf8");

    expect(aiPageSource).toContain(
      `streamGenRef.current === myGen
        && !aborted
        && shouldFailRunningToolsOnAbnormalEnd(terminalReason)`,
    );
  });

  it("guards project copilot abnormal-end cleanup behind current generation ownership", () => {
    const projectCopilotSource = readFileSync(resolve(process.cwd(), "hooks/useCopilotStreamActions.ts"), "utf8");

    expect(projectCopilotSource).toContain(
      `streamGenRef.current === myGen
                && !aborted
                && shouldFailRunningToolsOnAbnormalEnd(terminalReason)`,
    );
  });
});
