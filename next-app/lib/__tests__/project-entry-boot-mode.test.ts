// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { markConversationActive, setProjectModeBucket } from "@/lib/project-entry-restore";
import {
  deriveProjectShellBootState,
  tabFromProjectPathname,
} from "@/lib/project-entry-boot-mode";

const PROJECT_ID = "proj-boot-1";

describe("project entry boot mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("maps deep-link routes to workspace tabs", () => {
    expect(tabFromProjectPathname(`/project/${PROJECT_ID}/protocol`)).toBe("protocol");
    expect(tabFromProjectPathname(`/project/${PROJECT_ID}/ledger/study-1`)).toBe("ledger");
    expect(tabFromProjectPathname(`/project/${PROJECT_ID}`)).toBeNull();
  });

  it("defaults root project entry to overview when no restore state exists", () => {
    expect(
      deriveProjectShellBootState({
        pathname: `/project/${PROJECT_ID}`,
        projectId: PROJECT_ID,
        projectEntryRestoreEnabled: true,
      }),
    ).toEqual({
      focusMode: "view",
      activeTab: "overview",
      bootMode: "overview",
    });
  });

  it("treats canonical conversation routes as deterministic boot modes", () => {
    setProjectModeBucket(PROJECT_ID, "workspace");

    expect(
      deriveProjectShellBootState({
        pathname: `/project/${PROJECT_ID}/conversation/conv-1`,
        projectId: PROJECT_ID,
        projectEntryRestoreEnabled: true,
      }),
    ).toEqual({
      focusMode: "conversation",
      activeTab: "overview",
      bootMode: "conversation",
    });
  });

  it("keeps root project entry deterministic even when legacy restore state exists", () => {
    const now = Date.now();
    markConversationActive(PROJECT_ID, "conv-restore", now);
    vi.setSystemTime(now + 1000);

    expect(
      deriveProjectShellBootState({
        pathname: `/project/${PROJECT_ID}`,
        projectId: PROJECT_ID,
        projectEntryRestoreEnabled: true,
      }),
    ).toEqual({
      focusMode: "view",
      activeTab: "overview",
      bootMode: "overview",
    });
  });

  it("treats deep links as deterministic boot modes regardless of saved bucket", () => {
    setProjectModeBucket(PROJECT_ID, "conversation");

    expect(
      deriveProjectShellBootState({
        pathname: `/project/${PROJECT_ID}/notes`,
        projectId: PROJECT_ID,
        projectEntryRestoreEnabled: true,
      }),
    ).toEqual({
      focusMode: "view",
      activeTab: "notes",
      bootMode: "notes",
    });
  });
});
