import { describe, expect, it } from "vitest";

import { ArtifactError, isArtifactError } from "@/lib/server/agent/artifact-errors";

describe("artifact-errors", () => {
  it("preserves the explicit artifact error code", () => {
    const error = new ArtifactError("ARTIFACT_APPLY_FAILED", "apply failed");

    expect(error.name).toBe("ArtifactError");
    expect(error.errorCode).toBe("ARTIFACT_APPLY_FAILED");
    expect(error.message).toBe("apply failed");
  });

  it("identifies ArtifactError instances", () => {
    expect(isArtifactError(new ArtifactError("ARTIFACT_INVALID_STATE"))).toBe(true);
    expect(isArtifactError(new Error("plain"))).toBe(false);
  });
});
