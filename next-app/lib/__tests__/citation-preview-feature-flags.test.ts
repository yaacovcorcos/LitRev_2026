import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
    NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH: process.env.NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH,
    ENABLE_CITATION_HOVER_PREFETCH: process.env.ENABLE_CITATION_HOVER_PREFETCH,
};

async function loadFlagsModule() {
    vi.resetModules();
    return import("../citation-preview-feature-flags");
}

describe("citation preview feature flags", () => {
    afterEach(() => {
        if (ORIGINAL_ENV.NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH === undefined) {
            delete process.env.NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH;
        } else {
            process.env.NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH =
                ORIGINAL_ENV.NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH;
        }

        if (ORIGINAL_ENV.ENABLE_CITATION_HOVER_PREFETCH === undefined) {
            delete process.env.ENABLE_CITATION_HOVER_PREFETCH;
        } else {
            process.env.ENABLE_CITATION_HOVER_PREFETCH = ORIGINAL_ENV.ENABLE_CITATION_HOVER_PREFETCH;
        }
    });

    it("defaults citation hover prefetch to enabled when unset", async () => {
        delete process.env.NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH;
        delete process.env.ENABLE_CITATION_HOVER_PREFETCH;

        const { isCitationHoverPrefetchEnabled } = await loadFlagsModule();
        expect(isCitationHoverPrefetchEnabled()).toBe(true);
    });

    it("still allows explicit disable through env", async () => {
        process.env.NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH = "0";
        delete process.env.ENABLE_CITATION_HOVER_PREFETCH;

        const { isCitationHoverPrefetchEnabled } = await loadFlagsModule();
        expect(isCitationHoverPrefetchEnabled()).toBe(false);
    });
});
