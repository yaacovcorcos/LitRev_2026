// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    MODEL_AVAILABILITY_TIMEOUT_MS,
    useModelAvailability,
} from "@/hooks/useModelAvailability";

function abortablePendingResponse(signal: AbortSignal): Promise<Response> {
    return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("useModelAvailability", () => {
    it("times out a stalled request and recovers through retry", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn()
            .mockImplementationOnce((_url: string, init: RequestInit) => (
                abortablePendingResponse(init.signal as AbortSignal)
            ))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                availability: { "gpt-5.6-luna": true },
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }));
        vi.stubGlobal("fetch", fetchMock);

        const { result } = renderHook(() => useModelAvailability());
        expect(result.current.status).toBe("loading");

        await act(async () => {
            await vi.advanceTimersByTimeAsync(MODEL_AVAILABILITY_TIMEOUT_MS);
        });
        expect(result.current).toMatchObject({
            status: "error",
            errorMessage: "Model setup check timed out. Retry before sending.",
        });

        vi.useRealTimers();
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.status).toBe("ready"));
        expect(result.current.availability?.["gpt-5.6-luna"]).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("aborts and clears the deadline when the consumer unmounts", () => {
        vi.useFakeTimers();
        let requestSignal: AbortSignal | undefined;
        vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
            requestSignal = init.signal as AbortSignal;
            return abortablePendingResponse(requestSignal);
        }));

        const { unmount } = renderHook(() => useModelAvailability());
        expect(requestSignal?.aborted).toBe(false);
        expect(vi.getTimerCount()).toBe(1);

        unmount();

        expect(requestSignal?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
});
