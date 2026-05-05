import { describe, expect, it, vi } from "vitest";
import { parseNDJSONStream } from "@/lib/ai/stream-parser";

describe("parseNDJSONStream", () => {
  it("throws AbortError instead of silently converting caller cancellation into an interrupted stream", async () => {
    const controller = new AbortController();
    controller.abort();
    const reader = {
      read: vi.fn(),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    const iterator = parseNDJSONStream(reader, controller.signal);

    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
    expect(reader.read).not.toHaveBeenCalled();
  });
});
