/**
 * Loop Controller
 * Budget-aware control for the AI tool execution loop.
 * Pure module — no server-only, no DB imports. (planC Phase 3)
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type StopReason =
    | "natural"
    | "max_iterations"
    | "max_tool_calls"
    | "wall_time"
    | "repeat_detected"
    | "cancelled"
    | "error"
    | "paused_for_input";

export interface LoopBudget {
    maxIterations: number;
    maxToolCalls: number;
    maxWallTimeMs: number;
}

export const DEFAULT_LOOP_BUDGET: LoopBudget = {
    maxIterations: 10,
    maxToolCalls: 25,
    maxWallTimeMs: 120_000,
};

export const DOOM_LOOP_THRESHOLD = 3;

// ── Tool Call Hashing ────────────────────────────────────────────────────────

/** Deterministic hash of a tool call for repeat detection. */
export function hashToolCall(name: string, args: Record<string, unknown>): string {
    return name + ":" + stableStringify(args);
}

const MAX_TOOL_CALL_STRINGIFY_DEPTH = 20;

function stableStringify(obj: unknown, depth = 0, seen = new WeakSet<object>()): string {
    if (obj === null || obj === undefined) return String(obj);
    if (typeof obj !== "object") return JSON.stringify(obj);
    if (depth >= MAX_TOOL_CALL_STRINGIFY_DEPTH) return JSON.stringify("[MaxDepthExceeded]");
    if (seen.has(obj)) return JSON.stringify("[Circular]");
    seen.add(obj);
    if (Array.isArray(obj)) {
        const result = "[" + obj.map((item) => stableStringify(item, depth + 1, seen)).join(",") + "]";
        seen.delete(obj);
        return result;
    }
    const sorted = Object.keys(obj as Record<string, unknown>).sort();
    const result = "{" + sorted.map(k =>
        JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k], depth + 1, seen)
    ).join(",") + "}";
    seen.delete(obj);
    return result;
}

// ── Loop State ───────────────────────────────────────────────────────────────

export class LoopState {
    readonly budget: LoopBudget;
    private startedAt: number;
    private _iterations = 0;
    private _totalToolCalls = 0;
    private _lastToolHash: string | null = null;
    private _consecutiveSameToolCallCount = 0;
    private _repeatDetected = false;
    private _stopReason: StopReason | null = null;

    constructor(budget?: Partial<LoopBudget>) {
        this.budget = { ...DEFAULT_LOOP_BUDGET, ...budget };
        this.startedAt = Date.now();
    }

    get iterations(): number { return this._iterations; }
    get totalToolCalls(): number { return this._totalToolCalls; }
    get stopReason(): StopReason | null { return this._stopReason; }
    get elapsedMs(): number { return Date.now() - this.startedAt; }

    /**
     * Record tool calls from one iteration.
     * Returns true when the same tool call repeats consecutively enough times
     * to trigger doom-loop protection.
     */
    recordToolCalls(calls: { name: string; arguments: Record<string, unknown>; repeatKey?: string }[]): boolean {
        this._totalToolCalls += calls.length;
        for (const call of calls) {
            const hash = call.repeatKey ?? hashToolCall(call.name, call.arguments);
            if (hash === this._lastToolHash) {
                this._consecutiveSameToolCallCount += 1;
            } else {
                this._lastToolHash = hash;
                this._consecutiveSameToolCallCount = 1;
            }
            if (this._consecutiveSameToolCallCount >= DOOM_LOOP_THRESHOLD) {
                this._repeatDetected = true;
                if (!this._stopReason) {
                    this._stopReason = "repeat_detected";
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Call at the top of each iteration.
     * Returns { continue: true } or { continue: false, stopReason }.
     */
    shouldContinue(signal?: AbortSignal): { continue: true } | { continue: false; stopReason: StopReason } {
        // Already stopped
        if (this._stopReason) {
            return { continue: false, stopReason: this._stopReason };
        }

        // Cancel check
        if (signal?.aborted) {
            this._stopReason = "cancelled";
            return { continue: false, stopReason: "cancelled" };
        }

        // Iteration budget
        if (this._iterations >= this.budget.maxIterations) {
            this._stopReason = "max_iterations";
            return { continue: false, stopReason: "max_iterations" };
        }

        // Tool call budget
        if (this._totalToolCalls >= this.budget.maxToolCalls) {
            this._stopReason = "max_tool_calls";
            return { continue: false, stopReason: "max_tool_calls" };
        }

        // Wall time budget
        if (this.elapsedMs >= this.budget.maxWallTimeMs) {
            this._stopReason = "wall_time";
            return { continue: false, stopReason: "wall_time" };
        }

        // Repeat detection (set by recordToolCalls)
        if (this._repeatDetected) {
            this._stopReason = "repeat_detected";
            return { continue: false, stopReason: "repeat_detected" };
        }

        // Increment and allow
        this._iterations++;
        return { continue: true };
    }

    /**
     * Mark the loop as stopped for a given reason (e.g., "natural" or "error").
     * First write wins — subsequent calls are ignored.
     */
    markStopped(reason: StopReason): void {
        if (!this._stopReason) {
            this._stopReason = reason;
        }
    }
}
