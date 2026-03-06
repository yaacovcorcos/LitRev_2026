import { afterEach, describe, expect, it, vi } from "vitest";

async function loadFlagsModule() {
    vi.resetModules();
    return import("../citation-preview-feature-flags");
}

describe("citation preview feature flags", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("defaults citation hover prefetch to enabled when unset", async () => {
        vi.stubEnv("NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH", undefined);
        vi.stubEnv("ENABLE_CITATION_HOVER_PREFETCH", undefined);

        const { isCitationHoverPrefetchEnabled } = await loadFlagsModule();
        expect(isCitationHoverPrefetchEnabled()).toBe(true);
    });

    it("still allows explicit disable through env", async () => {
        vi.stubEnv("NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH", "0");
        vi.stubEnv("ENABLE_CITATION_HOVER_PREFETCH", undefined);

        const { isCitationHoverPrefetchEnabled } = await loadFlagsModule();
        expect(isCitationHoverPrefetchEnabled()).toBe(false);
    });

    it("ignores server-only hover prefetch env overrides in the client flag helper", async () => {
        vi.stubEnv("NEXT_PUBLIC_ENABLE_CITATION_HOVER_PREFETCH", undefined);
        vi.stubEnv("ENABLE_CITATION_HOVER_PREFETCH", "0");

        const { isCitationHoverPrefetchEnabled } = await loadFlagsModule();
        expect(isCitationHoverPrefetchEnabled()).toBe(true);
    });
});
