/**
 * Langfuse Observability Adapter
 * Thin wrapper that provides tracing helpers with a no-op fallback.
 * When LANGFUSE_PUBLIC_KEY is not set, all calls are zero-cost no-ops.
 * (planC Phase 9)
 */

import "server-only";
import { createRequire } from "node:module";
import { logServerWarn } from "@/lib/server/logging";

// ── Types ────────────────────────────────────────────────────────────────────

/** Unified span interface — callers never need null checks */
export interface TracingSpan {
    update(data: Record<string, unknown>): TracingSpan;
    end(): void;
    startObservation(
        name: string,
        data?: Record<string, unknown>,
        opts?: { asType?: string }
    ): TracingSpan;
    updateTrace(data: Record<string, unknown>): TracingSpan;
}

export const NOOP_SPAN: TracingSpan = {
    update: () => NOOP_SPAN,
    end: () => {},
    startObservation: () => NOOP_SPAN,
    updateTrace: () => NOOP_SPAN,
};

// ── Initialization ───────────────────────────────────────────────────────────

// Store on globalThis to survive Next.js HMR in dev mode
// (same pattern as Prisma singleton)
const g = globalThis as typeof globalThis & {
    __langfuseSDK?: unknown;
    __langfuseProcessor?: { forceFlush(): Promise<void> };
};
const tracingRequire = createRequire(import.meta.url);

/**
 * Initialize Langfuse tracing. Called once from instrumentation.ts.
 * No-op when env vars are missing.
 */
export async function initTracing(): Promise<void> {
    if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) return;
    if (g.__langfuseSDK) return; // Already initialized

    try {
        // Dynamic imports so these packages are never loaded when tracing is disabled
        const { NodeSDK } = await import("@opentelemetry/sdk-node");
        const { LangfuseSpanProcessor } = await import("@langfuse/otel");

        const processor = new LangfuseSpanProcessor({
            publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
            secretKey: process.env.LANGFUSE_SECRET_KEY!,
            baseUrl: process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com",
            environment: process.env.NODE_ENV ?? "development",
        });

        const sdk = new NodeSDK({ spanProcessors: [processor] });
        sdk.start();

        g.__langfuseSDK = sdk;
        g.__langfuseProcessor = processor;
    } catch (err) {
        logServerWarn("tracing", "failed to initialize langfuse", undefined, err);
    }
}

/** Check if tracing is active */
export function isTracingEnabled(): boolean {
    return g.__langfuseSDK !== undefined && g.__langfuseProcessor !== undefined;
}

// ── Arg Summarization ────────────────────────────────────────────────────────

const VERBOSE = () => process.env.LANGFUSE_VERBOSE === "1";

/**
 * Summarize tool args for tracing. Fail-closed: default logs key names only.
 * Set LANGFUSE_VERBOSE=1 for full args during debugging.
 */
export function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    if (VERBOSE()) return args;
    return { argKeys: Object.keys(args) };
}

// ── Span Helpers ─────────────────────────────────────────────────────────────

/**
 * Start a root trace for an agent run.
 */
export function startRunTrace(
    runId: string,
    metadata: {
        projectId: string;
        agentMode: string;
        model?: string;
        userId: string;
        conversationId: string;
    }
): TracingSpan {
    if (!isTracingEnabled()) return NOOP_SPAN;

    try {
        // Resolve Langfuse lazily so disabled environments avoid loading it entirely.
        const { startObservation } = tracingRequire("@langfuse/tracing") as {
            startObservation: (
                name: string,
                input: { metadata: Record<string, unknown> },
            ) => TracingSpan;
        };
        const span = startObservation(
            "agent-run",
            { metadata: { runId, ...metadata } },
        ) as TracingSpan;
        span.updateTrace({
            userId: metadata.userId,
            sessionId: metadata.conversationId,
            metadata: {
                runId,
                projectId: metadata.projectId,
                agentMode: metadata.agentMode,
                model: metadata.model,
            },
        });
        return span;
    } catch {
        return NOOP_SPAN;
    }
}

/**
 * Start an LLM generation span (child of run trace).
 * Logs model + counts only — never message content.
 */
export function startLLMGeneration(
    parent: TracingSpan,
    name: string,
    opts: { model?: string; inputMessageCount: number; toolCount: number }
): TracingSpan {
    if (!isTracingEnabled()) return NOOP_SPAN;

    try {
        return parent.startObservation(
            name,
            {
                model: opts.model,
                input: {
                    messageCount: opts.inputMessageCount,
                    toolCount: opts.toolCount,
                },
            },
            { asType: "generation" }
        );
    } catch {
        return NOOP_SPAN;
    }
}

/**
 * Start a tool execution span (child of run trace).
 * Default: logs tool name + arg key names only. Verbose: full args.
 */
export function startToolSpan(
    parent: TracingSpan,
    toolName: string,
    args: Record<string, unknown>
): TracingSpan {
    if (!isTracingEnabled()) return NOOP_SPAN;

    try {
        return parent.startObservation(
            toolName,
            { input: summarizeArgs(args) },
            { asType: "tool" }
        );
    } catch {
        return NOOP_SPAN;
    }
}

/**
 * Start a generic span (e.g., context assembly, memory retrieval).
 */
export function startContextSpan(
    parent: TracingSpan,
    name: string
): TracingSpan {
    if (!isTracingEnabled()) return NOOP_SPAN;

    try {
        return parent.startObservation(name, {});
    } catch {
        return NOOP_SPAN;
    }
}

/**
 * Record an evaluation score on a trace (e.g., artifact accept/reject).
 * No-op when tracing is disabled.
 */
export function recordScore(
    _traceSpan: TracingSpan,
    _name: string,
    _value: number,
    _comment?: string
): void {
    // Score recording requires LangfuseClient from @langfuse/client.
    // Deferred to a future iteration — the trace/span layer is the priority.
}

// ── Flush ────────────────────────────────────────────────────────────────────

/**
 * Flush buffered spans to Langfuse. Timeout-capped at 2s.
 * Called after run completion in ai-service.ts (not in route.ts).
 */
export async function flushTracing(): Promise<void> {
    if (!g.__langfuseProcessor) return;

    try {
        await Promise.race([
            g.__langfuseProcessor.forceFlush(),
            new Promise<void>((r) => setTimeout(r, 2000)),
        ]);
    } catch {
        // Flush failure is non-fatal — don't break the request
    }
}
