import { afterEach, describe, expect, it } from "vitest";
import {
  getMobileFeatureSnapshot,
  isMobileAiV2Enabled,
  isMobileDraftV2Enabled,
  isMobileLedgerV2Enabled,
  isMobileNotesV2Enabled,
  isMobilePopupV2Enabled,
  isMobileScrollLockV2Enabled,
  isMobileShellV2Enabled,
  isMobileViewportV2Enabled,
} from "../feature-flags";

const KEYS = [
  "NEXT_PUBLIC_MOBILE_VP_V2",
  "NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2",
  "NEXT_PUBLIC_MOBILE_LEDGER_V2",
  "NEXT_PUBLIC_MOBILE_NOTES_V2",
  "NEXT_PUBLIC_MOBILE_DRAFT_V2",
  "NEXT_PUBLIC_MOBILE_AI_V2",
  "NEXT_PUBLIC_MOBILE_POPUP_V2",
  "NEXT_PUBLIC_MOBILE_SHELL_V2",
] as const;

afterEach(() => {
  for (const key of KEYS) {
    delete process.env[key];
  }
});

describe("mobile feature flags", () => {
  it("defaults all mobile flags to false", () => {
    expect(isMobileViewportV2Enabled()).toBe(false);
    expect(isMobileScrollLockV2Enabled()).toBe(false);
    expect(isMobileLedgerV2Enabled()).toBe(false);
    expect(isMobileNotesV2Enabled()).toBe(false);
    expect(isMobileDraftV2Enabled()).toBe(false);
    expect(isMobileAiV2Enabled()).toBe(false);
    expect(isMobilePopupV2Enabled()).toBe(false);
    expect(isMobileShellV2Enabled()).toBe(false);
  });

  it("parses truthy and falsy env values", () => {
    process.env.NEXT_PUBLIC_MOBILE_VP_V2 = "1";
    process.env.NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2 = "off";
    process.env.NEXT_PUBLIC_MOBILE_SHELL_V2 = "yes";
    expect(isMobileViewportV2Enabled()).toBe(true);
    expect(isMobileScrollLockV2Enabled()).toBe(false);
    expect(isMobileShellV2Enabled()).toBe(true);
  });

  it("returns a snapshot of effective flag values", () => {
    process.env.NEXT_PUBLIC_MOBILE_LEDGER_V2 = "true";
    process.env.NEXT_PUBLIC_MOBILE_NOTES_V2 = "1";
    process.env.NEXT_PUBLIC_MOBILE_SHELL_V2 = "true";

    expect(getMobileFeatureSnapshot()).toEqual({
      viewportV2: false,
      scrollLockV2: false,
      ledgerV2: true,
      notesV2: true,
      draftV2: false,
      aiV2: false,
      popupV2: false,
      shellV2: true,
    });
  });
});
