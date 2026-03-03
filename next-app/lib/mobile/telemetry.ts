import { COARSE_POINTER_MEDIA_QUERY, MOBILE_VIEWPORT_MEDIA_QUERY } from "./breakpoints";

export type MobileMetricType =
  | "mobile_viewport_issue"
  | "mobile_keyboard_overlap"
  | "mobile_action_tap"
  | "mobile_drawer_opened"
  | "mobile_flow_completed";

export type MobileSurface =
  | "app_shell"
  | "project_shell"
  | "ledger"
  | "notes"
  | "draft"
  | "ai"
  | "popup"
  | "protocol"
  | "study_detail"
  | "memory";

export type MobileMetricPayload =
  | {
      issue: "layout_shift" | "content_clipped" | "double_scroll" | "dead_scroll";
      route: string;
      viewportHeight?: number;
      keyboardOpen?: boolean;
    }
  | {
      route: string;
      elementId: string;
      overlapPx: number;
    }
  | {
      route: string;
      actionId: string;
      targetMinPx?: number;
      inputMode?: "touch" | "mouse" | "keyboard";
    }
  | {
      route: string;
      drawerId: string;
      source: "button" | "gesture" | "shortcut";
    }
  | {
      route: string;
      flowId:
        | "ledger_triage"
        | "notes_edit"
        | "draft_edit"
        | "ai_message_send"
        | "popup_continue_to_copilot";
      durationMs?: number;
      success: boolean;
    };

export type MobileMetricEvent = {
  version: 1;
  type: MobileMetricType;
  surface: MobileSurface;
  timestamp: string;
  payload: MobileMetricPayload;
};

const STORAGE_KEY = "litrev:mobile-metrics:v1";
const STORAGE_LIMIT = 2000;
const METRIC_EVENT = "litrev:mobile-metric";

function readEventsFromStorage(): MobileMetricEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((event) => event && typeof event === "object") as MobileMetricEvent[];
  } catch {
    return [];
  }
}

export function recordMobileMetric(event: Omit<MobileMetricEvent, "version" | "timestamp">): void {
  if (typeof window === "undefined") return;

  const normalized: MobileMetricEvent = {
    version: 1,
    timestamp: new Date().toISOString(),
    ...event,
  };

  window.dispatchEvent(new CustomEvent<MobileMetricEvent>(METRIC_EVENT, { detail: normalized }));

  try {
    const existing = readEventsFromStorage();
    const next = [...existing, normalized];
    const bounded = next.length > STORAGE_LIMIT ? next.slice(next.length - STORAGE_LIMIT) : next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Best-effort telemetry only.
  }
}

export function getMobileMetricEvents(): MobileMetricEvent[] {
  return readEventsFromStorage();
}

export function clearMobileMetrics(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort cleanup only.
  }
}

export function isMobileTelemetryContext(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return (
    window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY).matches
    || window.matchMedia(COARSE_POINTER_MEDIA_QUERY).matches
  );
}
