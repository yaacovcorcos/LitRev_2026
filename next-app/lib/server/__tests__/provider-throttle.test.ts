import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    buildSearchProviderThrottleKey,
    fetchSearchProvider,
    SearchProviderHttpError,
    SearchProviderThrottle,
    SearchProviderThrottleBusyError,
    type SearchProviderThrottleStore,
} from "@/lib/server/search/provider-throttle";

function createStore() {
    const reserve = vi.fn<SearchProviderThrottleStore["reserve"]>();
    const readCooldown = vi.fn<SearchProviderThrottleStore["readCooldown"]>(async () => ({
        cooldownUntil: null,
        dbNow: new Date(0),
    }));
    const defer = vi.fn<SearchProviderThrottleStore["defer"]>(async () => {});
    return { reserve, readCooldown, defer };
}

describe("shared search-provider throttle", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.NCBI_API_KEY;
        delete process.env.SEMANTIC_SCHOLAR_API_KEY;
        delete process.env.OPENALEX_EMAIL;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("never includes raw provider credentials in the durable key", () => {
        const credential = "secret-provider-key";
        const key = buildSearchProviderThrottleKey("pubmed", credential);

        expect(key).toMatch(/^pubmed:credential:[a-f0-9]{24}$/);
        expect(key).not.toContain(credential);
        expect(buildSearchProviderThrottleKey("pubmed", credential)).toBe(key);
    });

    it("waits until the database-reserved slot before fetching", async () => {
        const store = createStore();
        store.reserve.mockResolvedValue({ reservedAt: new Date(1_750), dbNow: new Date(1_000) });
        const sleep = vi.fn(async () => {});
        const throttle = new SearchProviderThrottle(store, { sleep });

        await throttle.wait("pubmed");

        expect(store.reserve).toHaveBeenCalledWith("pubmed:anonymous", 340, 10_000);
        expect(sleep).toHaveBeenCalledWith(750, undefined);
        expect(store.readCooldown).toHaveBeenCalledWith("pubmed:anonymous");
    });

    it("re-reserves a slot invalidated by a shared Retry-After cooldown", async () => {
        const store = createStore();
        store.reserve
            .mockResolvedValueOnce({ reservedAt: new Date(1_340), dbNow: new Date(1_000) })
            .mockResolvedValueOnce({ reservedAt: new Date(3_000), dbNow: new Date(1_350) });
        store.readCooldown
            .mockResolvedValueOnce({ cooldownUntil: new Date(3_000), dbNow: new Date(1_350) })
            .mockResolvedValueOnce({ cooldownUntil: new Date(3_000), dbNow: new Date(3_000) });
        const sleep = vi.fn(async () => {});
        const throttle = new SearchProviderThrottle(store, { sleep });

        await throttle.wait("pubmed");

        expect(store.reserve).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenNthCalledWith(1, 340, undefined);
        expect(sleep).toHaveBeenNthCalledWith(2, 1_650, undefined);
    });

    it("does not advance the durable cursor for an already-aborted request", async () => {
        const store = createStore();
        const throttle = new SearchProviderThrottle(store);
        const controller = new AbortController();
        controller.abort();

        await expect(throttle.wait("pubmed", controller.signal)).rejects.toMatchObject({
            name: "AbortError",
        });

        expect(store.reserve).not.toHaveBeenCalled();
    });

    it("persists Retry-After cooldowns across instances", async () => {
        const store = createStore();
        const throttle = new SearchProviderThrottle(store);
        const response = new Response(null, {
            status: 429,
            headers: { "Retry-After": "2" },
        });

        await throttle.deferFromResponse("semantic-scholar", response);

        expect(store.defer).toHaveBeenCalledWith("semantic-scholar:anonymous", 2_000);
    });

    it("preserves HTTP status and retry headers for the central executor", async () => {
        const store = createStore();
        store.reserve.mockResolvedValue({ reservedAt: new Date(0), dbNow: new Date(0) });
        const throttle = new SearchProviderThrottle(store);
        global.fetch = vi.fn(async () => new Response(null, {
            status: 429,
            headers: { "Retry-After": "3" },
        }));

        const error = await fetchSearchProvider(
            "openalex",
            "https://api.openalex.org/works",
            undefined,
            { throttle },
        ).catch((caught) => caught);

        expect(error).toBeInstanceOf(SearchProviderHttpError);
        expect(error).toMatchObject({
            status: 429,
            statusCode: 429,
            code: "SEARCH_PROVIDER_HTTP_429",
            headers: expect.objectContaining({ "retry-after": "3" }),
        });
        expect(store.defer).toHaveBeenCalledWith("openalex:anonymous", 3_000);
    });

    it("does not issue the HTTP request when slot reservation fails closed", async () => {
        const store = createStore();
        store.reserve.mockRejectedValue(new SearchProviderThrottleBusyError("pubmed:anonymous", 340));
        const throttle = new SearchProviderThrottle(store);
        global.fetch = vi.fn();

        await expect(fetchSearchProvider(
            "pubmed",
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
            undefined,
            { throttle },
        )).rejects.toMatchObject({
            code: "SEARCH_PROVIDER_THROTTLE_BUSY",
            status: 429,
            headers: { "retry-after-ms": "340" },
        });

        expect(global.fetch).not.toHaveBeenCalled();
    });
});
