import { describe, expect, it } from "vitest";
import { parseNDJSONStream } from "@/lib/ai/stream-parser";

function readerFromText(text: string): ReadableStreamDefaultReader<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  }).getReader();
}

describe("parseNDJSONStream", () => {
  it("parses newline-delimited stream chunks", async () => {
    const events = [];
    for await (const event of parseNDJSONStream(readerFromText('{"type":"content","content":"hello"}\n'))) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "content", content: "hello" }]);
  });

  it("throws abort instead of silently completing when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();

    const events = parseNDJSONStream(readerFromText('{"type":"content","content":"hello"}\n'), controller.signal);

    await expect(events.next()).rejects.toMatchObject({ name: "AbortError" });
  });
});
