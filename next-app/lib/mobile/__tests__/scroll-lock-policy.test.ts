import { describe, expect, it } from "vitest";
import { shouldLockRootScroll } from "@/lib/mobile/scroll-lock-policy";

describe("shouldLockRootScroll", () => {
  it("keeps baseline behavior when A1 is disabled", () => {
    expect(shouldLockRootScroll({
      a1Enabled: false,
      mobileScrollLockV2Enabled: false,
      isMobileViewport: false,
      focusMode: "conversation",
    })).toBe(true);

    expect(shouldLockRootScroll({
      a1Enabled: false,
      mobileScrollLockV2Enabled: false,
      isMobileViewport: true,
      focusMode: "view",
    })).toBe(true);

    expect(shouldLockRootScroll({
      a1Enabled: false,
      mobileScrollLockV2Enabled: true,
      isMobileViewport: false,
      focusMode: "conversation",
    })).toBe(true);

    expect(shouldLockRootScroll({
      a1Enabled: false,
      mobileScrollLockV2Enabled: true,
      isMobileViewport: true,
      focusMode: "view",
    })).toBe(false);
  });

  it("locks desktop only in view mode when A1 is enabled", () => {
    expect(shouldLockRootScroll({
      a1Enabled: true,
      mobileScrollLockV2Enabled: false,
      isMobileViewport: false,
      focusMode: "view",
    })).toBe(true);

    expect(shouldLockRootScroll({
      a1Enabled: true,
      mobileScrollLockV2Enabled: true,
      isMobileViewport: false,
      focusMode: "view",
    })).toBe(true);

    expect(shouldLockRootScroll({
      a1Enabled: true,
      mobileScrollLockV2Enabled: false,
      isMobileViewport: false,
      focusMode: "conversation",
    })).toBe(false);

    expect(shouldLockRootScroll({
      a1Enabled: true,
      mobileScrollLockV2Enabled: true,
      isMobileViewport: false,
      focusMode: "conversation",
    })).toBe(false);
  });

  it("follows existing mobile lock behavior when A1 is enabled", () => {
    expect(shouldLockRootScroll({
      a1Enabled: true,
      mobileScrollLockV2Enabled: false,
      isMobileViewport: true,
      focusMode: "view",
    })).toBe(true);

    expect(shouldLockRootScroll({
      a1Enabled: true,
      mobileScrollLockV2Enabled: true,
      isMobileViewport: true,
      focusMode: "conversation",
    })).toBe(false);
  });
});
