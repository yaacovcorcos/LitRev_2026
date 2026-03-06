// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { setProjectModeBucket } from "@/lib/project-entry-restore";
import {
  deriveProjectShellBootState,
  tabFromProjectPathname,
} from "@/lib/project-entry-boot-mode";

const PROJECT_ID = "proj-boot-1";

describe("project entry boot mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("maps deep-link routes to workspace tabs", () => {
    expect(tabFromProjectPathname(`/project/${PROJECT_ID}/protocol`)).toBe("protocol");
    expect(tabFromProjectPathname(`/project/${PROJECT_ID}/ledger/study-1`)).toBe("ledger");
    expect(tabFromProjectPathname(`/project/${PROJECT_ID}`)).toBeNull();
  });

  it("defaults root project entry to conversation when no restore bucket exists", () => {
    expect(
      deriveProjectShellBootState({
        pathname: `/project/${PROJECT_ID}`,
        projectId: PROJECT_ID,
        projectEntryRestoreEnabled: true,
      }),
    ).toEqual({
      focusMode: "conversation",
      activeTab: "overview",
      bootMode: "conversation",
    });
  });

  it("restores root project entry to overview when the saved bucket is workspace", () => {
    setProjectModeBucket(PROJECT_ID, "workspace");

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
