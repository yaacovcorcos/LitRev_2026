// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearProjectEntryState,
  decideConversationRestore,
  getConversationRestoreTimeoutMs,
  markConversationActive,
  readProjectEntryState,
  setProjectModeBucket,
  writeProjectEntryState,
} from "@/lib/project-entry-restore";

const PROJECT_ID = "proj-restore-1";

describe("project entry restore policy", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to no state", () => {
    expect(readProjectEntryState(PROJECT_ID)).toBeNull();
    expect(decideConversationRestore(null, Date.now())).toEqual({
      shouldRestore: false,
      reason: "no_state",
    });
  });

  it("writes and reads mode bucket", () => {
    setProjectModeBucket(PROJECT_ID, "workspace");
    expect(readProjectEntryState(PROJECT_ID)?.lastModeBucket).toBe("workspace");
  });

  it("marks conversation active and restores within TTL", () => {
    const now = Date.now();
    markConversationActive(PROJECT_ID, "conv-1", now);
    const state = readProjectEntryState(PROJECT_ID);
    const known = new Set(["conv-1"]);
    expect(decideConversationRestore(state, now + 1000, known)).toEqual({
      shouldRestore: true,
      reason: "restored",
      conversationId: "conv-1",
    });
  });

  it("does not restore when TTL expired", () => {
    const now = Date.now();
    markConversationActive(PROJECT_ID, "conv-1", now);
    const state = readProjectEntryState(PROJECT_ID);
    expect(
      decideConversationRestore(state, now + getConversationRestoreTimeoutMs() + 1, new Set(["conv-1"])),
    ).toEqual({
      shouldRestore: false,
      reason: "ttl_expired",
    });
  });

  it("returns id_invalid when known set does not contain stored id", () => {
    const now = Date.now();
    markConversationActive(PROJECT_ID, "conv-1", now);
    const state = readProjectEntryState(PROJECT_ID);
    expect(decideConversationRestore(state, now + 1000, new Set(["conv-2"]))).toEqual({
      shouldRestore: false,
      reason: "id_invalid",
    });
  });

  it("resets invalid stored payload shape", () => {
    window.localStorage.setItem(
      "litrev:project-entry:v1:proj-restore-1",
      JSON.stringify({ bad: true }),
    );
    expect(readProjectEntryState(PROJECT_ID)).toBeNull();
    expect(window.localStorage.getItem("litrev:project-entry:v1:proj-restore-1")).toBeNull();
  });

  it("fails soft when storage write throws", () => {
    const setItemSpy = vi
      .spyOn(window.localStorage.__proto__, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() => writeProjectEntryState(PROJECT_ID, { lastModeBucket: "workspace" })).not.toThrow();
    setItemSpy.mockRestore();
  });

  it("fails soft when storage read throws", () => {
    const getItemSpy = vi
      .spyOn(window.localStorage.__proto__, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(readProjectEntryState(PROJECT_ID)).toBeNull();
    getItemSpy.mockRestore();
  });

  it("clears state safely", () => {
    setProjectModeBucket(PROJECT_ID, "conversation");
    clearProjectEntryState(PROJECT_ID);
    expect(readProjectEntryState(PROJECT_ID)).toBeNull();
  });
});

