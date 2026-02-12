/**
 * Next.js Instrumentation Hook
 * Called once on server startup. Initializes Langfuse tracing when configured.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { initTracing } = await import("@/lib/server/ai/tracing");
        await initTracing();
    }
}
