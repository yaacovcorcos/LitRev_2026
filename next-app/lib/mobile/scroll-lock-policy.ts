export type ScrollLockFocusMode = "conversation" | "view";

export type ScrollLockDecisionInput = {
  a1Enabled: boolean;
  mobileScrollLockV2Enabled: boolean;
  isMobileViewport: boolean;
  focusMode: ScrollLockFocusMode;
};

/**
 * Root scroll lock contract.
 *
 * Baseline path (A1 off):
 * - mobileScrollLockV2 off => lock everywhere
 * - mobileScrollLockV2 on  => lock desktop, unlock mobile
 *
 * A1 path:
 * - mobile viewport => follow existing mobileScrollLockV2 behavior
 * - desktop viewport => lock only in workspace view mode
 */
export function shouldLockRootScroll(input: ScrollLockDecisionInput): boolean {
  const { a1Enabled, mobileScrollLockV2Enabled, isMobileViewport, focusMode } = input;

  if (!a1Enabled) {
    if (!mobileScrollLockV2Enabled) return true;
    return !isMobileViewport;
  }

  if (isMobileViewport) {
    return !mobileScrollLockV2Enabled;
  }

  return focusMode === "view";
}
