import { describe, expect, it } from "vitest";
import {
  AI_CONVERSATION_QUERY_PARAM,
  AI_PROJECT_QUERY_PARAM,
  COPILOT_PANEL_OPEN_VALUE,
  COPILOT_PANEL_QUERY_PARAM,
  COPILOT_QUERY_PARAM,
  DEFAULT_ONBOARDING_STEP_STATUSES,
  DRAFT_MODE_QUERY_PARAM,
  DRAFT_SECTION_QUERY_PARAM,
  LEDGER_FILTER_QUERY_PARAM,
  LEDGER_STUDY_QUERY_PARAM,
  MEMORY_TAB_IDS,
  ONBOARDING_STEP_IDS,
  PROTOCOL_SECTION_IDS,
  buildAiRouteHref,
  buildCopilotRouteSearchParams,
  buildDraftRouteSearchParams,
  buildLedgerRouteHref,
  buildLedgerRouteSearchParams,
  buildLedgerStudyDetailHref,
  buildProjectConversationPath,
  isMemoryTabId,
  isOnboardingStepId,
  isProtocolSectionId,
  normalizeMemoryTabId,
  normalizeOnboardingStepId,
  normalizeProtocolSectionId,
  parseProjectConversationPath,
  readAiRouteState,
  readCopilotRouteState,
  readDraftRouteState,
  readLedgerRouteState,
} from "@/lib/durable-route-state";
import {
  DEFAULT_ONBOARDING_STEP_STATUSES as SCHEMA_DEFAULT_ONBOARDING_STEP_STATUSES,
  ONBOARDING_STEP_IDS as SCHEMA_ONBOARDING_STEP_IDS,
  ONBOARDING_STEP_STATUS_IDS,
} from "@/lib/schemas/onboarding";

describe("durable route state helpers", () => {
  it("builds and parses a project conversation route", () => {
    const pathname = buildProjectConversationPath("proj-1", "conv-2");
    expect(pathname).toBe("/project/proj-1/conversation/conv-2");
    expect(parseProjectConversationPath(pathname)).toEqual({
      projectId: "proj-1",
      conversationId: "conv-2",
    });
  });

  it("round-trips encoded project conversation route segments", () => {
    const pathname = buildProjectConversationPath("proj/1", "conv 2");
    expect(pathname).toBe("/project/proj%2F1/conversation/conv%202");
    expect(parseProjectConversationPath(pathname)).toEqual({
      projectId: "proj/1",
      conversationId: "conv 2",
    });
  });

  it("returns null for non-conversation project paths", () => {
    expect(parseProjectConversationPath("/project/proj-1")).toBeNull();
    expect(parseProjectConversationPath("/project/proj-1/ledger")).toBeNull();
  });

  it("rejects malformed encoded conversation route segments", () => {
    expect(
      parseProjectConversationPath("/project/proj%ZZ/conversation/conv-1"),
    ).toBeNull();
    expect(
      parseProjectConversationPath("/project/proj-1/conversation/conv%ZZ"),
    ).toBeNull();
  });

  it("normalizes copilot route state from query params", () => {
    const params = new URLSearchParams();
    params.set(COPILOT_QUERY_PARAM, "conv-1");
    params.set(COPILOT_PANEL_QUERY_PARAM, COPILOT_PANEL_OPEN_VALUE);
    expect(readCopilotRouteState(params)).toEqual({
      conversationId: "conv-1",
      panelRequestedOpen: true,
    });
    expect(buildCopilotRouteSearchParams({
      conversationId: "conv-1",
      panelRequestedOpen: true,
    }).toString()).toBe("copilot=conv-1&copilotPanel=open");
  });

  it("treats blank copilot identity as absent", () => {
    const params = new URLSearchParams();
    params.set(COPILOT_QUERY_PARAM, "   ");
    params.set(COPILOT_PANEL_QUERY_PARAM, COPILOT_PANEL_OPEN_VALUE);
    expect(readCopilotRouteState(params)).toEqual({
      conversationId: null,
      panelRequestedOpen: true,
    });
  });

  it("reads and builds AI route state", () => {
    const params = new URLSearchParams();
    params.set(AI_CONVERSATION_QUERY_PARAM, "conv-1");
    params.set(AI_PROJECT_QUERY_PARAM, "proj-2");
    expect(readAiRouteState(params)).toEqual({
      conversationId: "conv-1",
      projectId: "proj-2",
    });
    expect(buildAiRouteHref({
      conversationId: "conv-1",
      projectId: "proj-2",
    })).toBe("/ai?conversation=conv-1&project=proj-2");
    expect(buildAiRouteHref({
      conversationId: null,
      projectId: null,
    })).toBe("/ai");
  });

  it("treats blank AI route values as absent", () => {
    const params = new URLSearchParams();
    params.set(AI_CONVERSATION_QUERY_PARAM, "   ");
    params.set(AI_PROJECT_QUERY_PARAM, "");
    expect(readAiRouteState(params)).toEqual({
      conversationId: null,
      projectId: null,
    });
  });

  it("reads and builds draft route state", () => {
    const params = new URLSearchParams();
    params.set(DRAFT_MODE_QUERY_PARAM, "full");
    params.set(DRAFT_SECTION_QUERY_PARAM, "discussion");
    expect(readDraftRouteState(params)).toEqual({
      mode: "full",
      sectionId: "discussion",
    });
    expect(buildDraftRouteSearchParams({
      mode: "full",
      sectionId: "discussion",
    }).toString()).toBe("mode=full&section=discussion");
  });

  it("treats blank or invalid draft route values as absent", () => {
    const params = new URLSearchParams();
    params.set(DRAFT_MODE_QUERY_PARAM, "  invalid  ");
    params.set(DRAFT_SECTION_QUERY_PARAM, "   ");
    expect(readDraftRouteState(params)).toEqual({
      mode: null,
      sectionId: null,
    });
    expect(buildDraftRouteSearchParams({
      mode: null,
      sectionId: null,
    }).toString()).toBe("");
  });

  it("reads and builds ledger route state", () => {
    const params = new URLSearchParams();
    params.set(LEDGER_STUDY_QUERY_PARAM, "study-1");
    params.set(LEDGER_FILTER_QUERY_PARAM, "matching-design");

    expect(readLedgerRouteState(params)).toEqual({
      studyId: "study-1",
      criteriaFilter: "matching-design",
    });
    expect(
      buildLedgerRouteSearchParams(
        {
          studyId: "study-1",
          criteriaFilter: "matching-design",
        },
        params,
      ).toString(),
    ).toBe("study=study-1&filter=matching-design");
    expect(
      buildLedgerRouteHref(
        "proj-1",
        {
          studyId: "study-1",
          criteriaFilter: "matching-design",
        },
        params,
      ),
    ).toBe("/project/proj-1/ledger?study=study-1&filter=matching-design");
  });

  it("preserves unrelated query params when building ledger urls", () => {
    const params = new URLSearchParams(
      "copilot=conv-1&copilotPanel=open&study=stale-study",
    );
    const ledgerHref = buildLedgerRouteHref(
      "proj-1",
      {
        studyId: "study-1",
        criteriaFilter: "meets-criteria",
      },
      params,
    );
    const detailHref = buildLedgerStudyDetailHref(
      "proj-1",
      "study-1",
      { criteriaFilter: "meets-criteria" },
      params,
    );

    expect(ledgerHref).toBe(
      "/project/proj-1/ledger?copilot=conv-1&copilotPanel=open&study=study-1&filter=meets-criteria",
    );
    expect(detailHref).toBe(
      "/project/proj-1/ledger/study-1?copilot=conv-1&copilotPanel=open&filter=meets-criteria",
    );
  });

  it("treats blank or invalid ledger values as absent", () => {
    const params = new URLSearchParams();
    params.set(LEDGER_STUDY_QUERY_PARAM, "   ");
    params.set(LEDGER_FILTER_QUERY_PARAM, "invalid");

    expect(readLedgerRouteState(params)).toEqual({
      studyId: null,
      criteriaFilter: "all",
    });
    expect(
      buildLedgerRouteSearchParams(
        { studyId: null, criteriaFilter: "all" },
        params,
      ).toString(),
    ).toBe("");
  });

  it("exposes valid protocol section ids", () => {
    expect(PROTOCOL_SECTION_IDS).toContain("research-question");
    expect(isProtocolSectionId("pico-population")).toBe(true);
    expect(isProtocolSectionId("bad-section")).toBe(false);
    expect(normalizeProtocolSectionId(" search-query ")).toBe("search-query");
    expect(normalizeProtocolSectionId("search-query")).toBe("search-query");
  });

  it("exposes valid memory tab ids", () => {
    expect(MEMORY_TAB_IDS).toEqual([
      "project",
      "study",
      "preferences",
      "prisma",
      "health",
    ]);
    expect(isMemoryTabId("project")).toBe(true);
    expect(isMemoryTabId("other")).toBe(false);
    expect(normalizeMemoryTabId("health")).toBe("health");
    expect(normalizeMemoryTabId(" health ")).toBe("health");
  });

  it("exposes valid onboarding step ids and default statuses", () => {
    expect(ONBOARDING_STEP_IDS).toEqual(SCHEMA_ONBOARDING_STEP_IDS);
    expect(isOnboardingStepId("workflow")).toBe(true);
    expect(isOnboardingStepId("other")).toBe(false);
    expect(normalizeOnboardingStepId("launch")).toBe("launch");
    expect(normalizeOnboardingStepId(" launch ")).toBe("launch");
    expect(ONBOARDING_STEP_STATUS_IDS).toEqual(["pending", "completed", "skipped"]);
    expect(DEFAULT_ONBOARDING_STEP_STATUSES).toEqual(
      SCHEMA_DEFAULT_ONBOARDING_STEP_STATUSES,
    );
  });
});
