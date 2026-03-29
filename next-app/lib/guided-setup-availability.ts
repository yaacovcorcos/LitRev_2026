export type GuidedSetupAvailabilityState = "enabled" | "hold";

// Single source of truth for guided setup rollout. Flip to "enabled" to re-open the flow.
export const GUIDED_SETUP_ENTRY_STATE: GuidedSetupAvailabilityState = "hold";

export const GUIDED_SETUP_HOLD_COPY = {
  launcherDescription: "Guided setup is on hold. Coming soon. Create a blank project for now.",
  routeTitle: "Guided setup is on hold",
  routeDescription:
    "This setup flow is temporarily unavailable while it is being reworked. You can continue in the project workspace for now.",
  workspaceActionLabel: "Open workspace",
  dashboardActionLabel: "Back to dashboard",
} as const;

export function isGuidedSetupAvailable(): boolean {
  return GUIDED_SETUP_ENTRY_STATE === "enabled";
}
