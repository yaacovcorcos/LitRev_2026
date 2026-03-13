import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("search/scoping answer contract guards", () => {
  it("removes visible search-log scaffolding from scoping and search prompts", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/ai/prompts/copilot-prompts.ts"), "utf8");

    expect(source).not.toContain("Searches run (query + source + what each query added)");
    expect(source).not.toContain("Objective, Queries Run, Candidate Studies, Preliminary Quality Signals, Coverage Gaps, Recommended Next Step");
    expect(source).toContain("Do not narrate raw search queries, source-by-source search logs, or result-count mechanics in the prose answer unless the user explicitly asks for the search strategy.");
    expect(source).toContain("Keep raw search queries, result-count mechanics, and iteration logs out of the visible answer unless the user explicitly asked for the search strategy/query.");
  });

  it("keeps the runtime anti-duplication instruction in streamChatWithArtifacts", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/server/ai/ai-service.ts"), "utf8");

    expect(source).toContain("Process details such as search queries, result counts, and search refinement steps already have their own cards/checkpoints in the UI.");
    expect(source).toContain("In the visible answer, synthesize findings instead of repeating the process log.");
    expect(source).toContain("Only include exact queries or search-strategy details when the user explicitly asks for them.");
  });
});
