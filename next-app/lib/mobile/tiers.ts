import {
  COMPACT_MAX_WIDTH,
  EXPANSIVE_MIN_WIDTH,
  PHONE_MAX_WIDTH,
  TINY_PHONE_MAX_WIDTH,
} from "./breakpoints";

export type ResponsiveTier =
  | "tiny-phone"
  | "phone"
  | "compact"
  | "wide"
  | "expansive"
  | "unknown";

export type ResponsiveViewportClass = "phone" | "compact" | "desktop" | "unknown";

export function classifyViewportWidth(width: number): ResponsiveTier {
  if (!Number.isFinite(width) || width <= 0) return "unknown";
  if (width <= TINY_PHONE_MAX_WIDTH) return "tiny-phone";
  if (width <= PHONE_MAX_WIDTH) return "phone";
  if (width <= COMPACT_MAX_WIDTH) return "compact";
  if (width >= EXPANSIVE_MIN_WIDTH) return "expansive";
  return "wide";
}

export function collapseTierToViewportClass(tier: ResponsiveTier): ResponsiveViewportClass {
  switch (tier) {
    case "tiny-phone":
    case "phone":
      return "phone";
    case "compact":
      return "compact";
    case "wide":
    case "expansive":
      return "desktop";
    default:
      return "unknown";
  }
}

export function getViewportTier(win: Pick<Window, "innerWidth"> | null | undefined): ResponsiveTier {
  if (!win) return "unknown";
  return classifyViewportWidth(win.innerWidth);
}

export function getViewportClass(win: Pick<Window, "innerWidth"> | null | undefined): ResponsiveViewportClass {
  return collapseTierToViewportClass(getViewportTier(win));
}

export function isPhoneViewport(win: Pick<Window, "innerWidth"> | null | undefined): boolean {
  return getViewportClass(win) === "phone";
}

export function isCompactViewport(win: Pick<Window, "innerWidth"> | null | undefined): boolean {
  return getViewportClass(win) === "compact";
}
