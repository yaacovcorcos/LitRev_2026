import { describe, expect, it } from "vitest";

import { shouldOutputJson } from "../check-agent-quality-gate";

describe("check-agent-quality-gate CLI flags", () => {
  it("accepts standard boolean JSON flags", () => {
    expect(shouldOutputJson(["--json"])).toBe(true);
    expect(shouldOutputJson(["--json=true"])).toBe(true);
  });

  it("keeps compatibility with the previous json=1 flag", () => {
    expect(shouldOutputJson(["--json=1"])).toBe(true);
  });

  it("does not treat disabled or unrelated flags as JSON output", () => {
    expect(shouldOutputJson(["--json=false"])).toBe(false);
    expect(shouldOutputJson(["--json=0"])).toBe(false);
    expect(shouldOutputJson(["--other"])).toBe(false);
  });
});
