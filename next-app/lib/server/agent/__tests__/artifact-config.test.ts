import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARTIFACT_UNDO_WINDOW_MS,
  formatArtifactUndoWindow,
  getArtifactUndoWindowMs,
} from "../artifact-config";

describe("artifact undo configuration", () => {
  it("defaults to the current five minute undo window", () => {
    expect(getArtifactUndoWindowMs({})).toBe(DEFAULT_ARTIFACT_UNDO_WINDOW_MS);
  });

  it("accepts a positive millisecond override", () => {
    expect(getArtifactUndoWindowMs({
      ARTIFACT_UNDO_WINDOW_MS: String(15 * 60 * 1000),
    })).toBe(15 * 60 * 1000);
  });

  it("falls back to the default for invalid overrides", () => {
    expect(getArtifactUndoWindowMs({
      ARTIFACT_UNDO_WINDOW_MS: "0",
    })).toBe(DEFAULT_ARTIFACT_UNDO_WINDOW_MS);
    expect(getArtifactUndoWindowMs({
      ARTIFACT_UNDO_WINDOW_MS: "not-a-number",
    })).toBe(DEFAULT_ARTIFACT_UNDO_WINDOW_MS);
  });

  it("formats the undo window for user-facing errors", () => {
    expect(formatArtifactUndoWindow(5 * 60 * 1000)).toBe("5 minutes");
    expect(formatArtifactUndoWindow(1000)).toBe("1 second");
    expect(formatArtifactUndoWindow(1500)).toBe("1500ms");
  });
});
