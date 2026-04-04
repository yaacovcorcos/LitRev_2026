import type { Study } from "@/types/ledger";

const LEDGER_PREFIX = "litrev_ledger_";

function isBrowser() {
  return typeof window !== "undefined";
}

function storageKey(projectId: string) {
  return `${LEDGER_PREFIX}${projectId}`;
}

function coerceStudies(value: unknown, fallback: Study[]) {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const study = entry as Partial<Study>;
      return {
        id: typeof study.id === "string" ? study.id : `s-${Date.now()}`,
        title: typeof study.title === "string" ? study.title : "Untitled Study",
        authors: typeof study.authors === "string" ? study.authors : "Unknown",
        year: typeof study.year === "number" ? study.year : new Date().getFullYear(),
        status: study.status === "pending" ? "pending" : "extracted",
        quality: study.quality ?? "-",
      } satisfies Study;
    });
}

export function loadLedger(projectId: string, fallback: Study[]): Study[] {
  if (!isBrowser()) return fallback;
  try {
    const key = storageKey(projectId);
    const stored = window.localStorage.getItem(key);
    if (!stored) {
      window.localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    const parsed = JSON.parse(stored);
    const coerced = coerceStudies(parsed, fallback);
    if (!Array.isArray(parsed)) {
      window.localStorage.setItem(key, JSON.stringify(coerced));
    }
    return coerced;
  } catch (err) {
    console.warn("loadLedger failed", err);
    return fallback;
  }
}
