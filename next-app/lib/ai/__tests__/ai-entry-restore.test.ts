// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAiEntryRestoreState,
  decideAiEntryRestore,
  getAiEntryRestoreTimeoutMs,
  markAiRecoverableRun,
  readAiEntryRestoreState,
  writeAiEntryRestoreState,
} from "../ai-entry-restore";

describe("ai entry restore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reads and writes recoverable run identity", () => {
    markAiRecoverableRun(null, {
      conversationId: "conv-1",
      runId: "run-1",
      atMs: 1_000,
    });

    expect(readAiEntryRestoreState(null)).toEqual({
      version: 1,
      lastConversationId: "conv-1",
      lastRecoverableRunId: "run-1",
      lastRecoverableAtMs: 1_000,
    });
  });

  it("clears invalid stored payloads", () => {
    window.localStorage.setItem("litrev:ai-entry:v1:__global__", JSON.stringify({
      version: 999,
      lastConversationId: "conv-1",
      lastRecoverableRunId: "run-1",
      lastRecoverableAtMs: 1_000,
    }));

    expect(readAiEntryRestoreState(null)).toBeNull();
    expect(window.localStorage.getItem("litrev:ai-entry:v1:__global__")).toBeNull();
  });

  it("expires stale restore entries", () => {
    writeAiEntryRestoreState(null, {
      lastConversationId: "conv-1",
      lastRecoverableRunId: "run-1",
      lastRecoverableAtMs: 1_000,
    });

    expect(
      decideAiEntryRestore(
        readAiEntryRestoreState(null),
        1_000 + getAiEntryRestoreTimeoutMs() + 1,
      ),
    ).toEqual({
      shouldRestore: false,
      reason: "ttl_expired",
    });
  });

  it("rejects restore when the conversation is no longer available", () => {
    markAiRecoverableRun(null, {
      conversationId: "conv-1",
      runId: "run-1",
      atMs: 1_000,
    });

    expect(
      decideAiEntryRestore(
        readAiEntryRestoreState(null),
        1_001,
        new Set(["conv-2"]),
      ),
    ).toEqual({
      shouldRestore: false,
      reason: "conversation_invalid",
    });
  });

  it("keeps scope-local restore state separated between global and project-attached ai", () => {
    markAiRecoverableRun(null, {
      conversationId: "conv-global",
      runId: "run-global",
      atMs: 1_000,
    });
    markAiRecoverableRun("proj-1", {
      conversationId: "conv-project",
      runId: "run-project",
      atMs: 2_000,
    });

    expect(readAiEntryRestoreState(null)?.lastConversationId).toBe("conv-global");
    expect(readAiEntryRestoreState("proj-1")?.lastConversationId).toBe("conv-project");

    clearAiEntryRestoreState("proj-1");

    expect(readAiEntryRestoreState("proj-1")).toBeNull();
    expect(readAiEntryRestoreState(null)?.lastConversationId).toBe("conv-global");
  });
});
