const SAMPLE_CARD_KEY = "litrev:sample-card-dismissed:v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function isSampleCardDismissed(): boolean {
  if (!canUseStorage()) return false;
  return window.localStorage.getItem(SAMPLE_CARD_KEY) === "1";
}

export function dismissSampleCard(): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(SAMPLE_CARD_KEY, "1");
}

export function restoreSampleCard(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(SAMPLE_CARD_KEY);
}
