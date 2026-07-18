const FALSY = new Set(["0", "false", "off", "no"]);
const TRUTHY = new Set(["1", "true", "on", "yes"]);

function readFlag(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (FALSY.has(normalized)) return false;
  if (TRUTHY.has(normalized)) return true;
  return null;
}

type MobilePublicEnvName =
  | "NEXT_PUBLIC_MOBILE_VP_V2"
  | "NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2"
  | "NEXT_PUBLIC_MOBILE_LEDGER_V2"
  | "NEXT_PUBLIC_MOBILE_NOTES_V2"
  | "NEXT_PUBLIC_MOBILE_DRAFT_V2"
  | "NEXT_PUBLIC_MOBILE_AI_V2"
  | "NEXT_PUBLIC_MOBILE_POPUP_V2"
  | "NEXT_PUBLIC_MOBILE_SHELL_V2";

function getPublicFlag(name: MobilePublicEnvName): boolean | null {
  switch (name) {
    case "NEXT_PUBLIC_MOBILE_VP_V2":
      return readFlag(process.env.NEXT_PUBLIC_MOBILE_VP_V2);
    case "NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2":
      return readFlag(process.env.NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2);
    case "NEXT_PUBLIC_MOBILE_LEDGER_V2":
      return readFlag(process.env.NEXT_PUBLIC_MOBILE_LEDGER_V2);
    case "NEXT_PUBLIC_MOBILE_NOTES_V2":
      return readFlag(process.env.NEXT_PUBLIC_MOBILE_NOTES_V2);
    case "NEXT_PUBLIC_MOBILE_DRAFT_V2":
      return readFlag(process.env.NEXT_PUBLIC_MOBILE_DRAFT_V2);
    case "NEXT_PUBLIC_MOBILE_AI_V2":
      return readFlag(process.env.NEXT_PUBLIC_MOBILE_AI_V2);
    case "NEXT_PUBLIC_MOBILE_POPUP_V2":
      return readFlag(process.env.NEXT_PUBLIC_MOBILE_POPUP_V2);
    case "NEXT_PUBLIC_MOBILE_SHELL_V2":
      return readFlag(process.env.NEXT_PUBLIC_MOBILE_SHELL_V2);
    default:
      return null;
  }
}

export type MobileFeatureKey =
  | "viewportV2"
  | "scrollLockV2"
  | "ledgerV2"
  | "notesV2"
  | "draftV2"
  | "aiV2"
  | "popupV2"
  | "shellV2";

const DEFAULTS: Record<MobileFeatureKey, boolean> = {
  viewportV2: true,
  scrollLockV2: false,
  ledgerV2: false,
  notesV2: false,
  draftV2: false,
  aiV2: false,
  popupV2: false,
  shellV2: false,
};

function getFlag(name: MobilePublicEnvName, fallback: boolean): boolean {
  const value = getPublicFlag(name);
  if (value !== null) return value;
  return fallback;
}

export function isMobileViewportV2Enabled(): boolean {
  return getFlag("NEXT_PUBLIC_MOBILE_VP_V2", DEFAULTS.viewportV2);
}

export function isMobileScrollLockV2Enabled(): boolean {
  return getFlag("NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2", DEFAULTS.scrollLockV2);
}

export function isMobileLedgerV2Enabled(): boolean {
  return getFlag("NEXT_PUBLIC_MOBILE_LEDGER_V2", DEFAULTS.ledgerV2);
}

export function isMobileNotesV2Enabled(): boolean {
  return getFlag("NEXT_PUBLIC_MOBILE_NOTES_V2", DEFAULTS.notesV2);
}

export function isMobileDraftV2Enabled(): boolean {
  return getFlag("NEXT_PUBLIC_MOBILE_DRAFT_V2", DEFAULTS.draftV2);
}

export function isMobileAiV2Enabled(): boolean {
  return getFlag("NEXT_PUBLIC_MOBILE_AI_V2", DEFAULTS.aiV2);
}

export function isMobilePopupV2Enabled(): boolean {
  return getFlag("NEXT_PUBLIC_MOBILE_POPUP_V2", DEFAULTS.popupV2);
}

export function isMobileShellV2Enabled(): boolean {
  return getFlag("NEXT_PUBLIC_MOBILE_SHELL_V2", DEFAULTS.shellV2);
}

export function getMobileFeatureSnapshot(): Record<MobileFeatureKey, boolean> {
  return {
    viewportV2: isMobileViewportV2Enabled(),
    scrollLockV2: isMobileScrollLockV2Enabled(),
    ledgerV2: isMobileLedgerV2Enabled(),
    notesV2: isMobileNotesV2Enabled(),
    draftV2: isMobileDraftV2Enabled(),
    aiV2: isMobileAiV2Enabled(),
    popupV2: isMobilePopupV2Enabled(),
    shellV2: isMobileShellV2Enabled(),
  };
}
