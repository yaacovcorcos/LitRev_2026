import "server-only";

export const ARTIFACT_UNDO_WINDOW_MS_ENV = "ARTIFACT_UNDO_WINDOW_MS";
export const DEFAULT_ARTIFACT_UNDO_WINDOW_MS = 5 * 60 * 1000;

type Environment = Record<string, string | undefined>;

export function getArtifactUndoWindowMs(env: Environment = process.env) {
    const configured = env[ARTIFACT_UNDO_WINDOW_MS_ENV]?.trim();
    if (!configured) return DEFAULT_ARTIFACT_UNDO_WINDOW_MS;

    const parsed = Number(configured);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.floor(parsed)
        : DEFAULT_ARTIFACT_UNDO_WINDOW_MS;
}

export function formatArtifactUndoWindow(ms: number) {
    if (ms % 60_000 === 0) {
        const minutes = ms / 60_000;
        return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    }

    if (ms % 1000 === 0) {
        const seconds = ms / 1000;
        return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
    }

    return `${ms}ms`;
}
