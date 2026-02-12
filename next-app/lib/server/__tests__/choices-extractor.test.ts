import { describe, it, expect } from "vitest";
import { parseChoicesBlock, withChoicesExtraction } from "../ai/choices-extractor";
import type { AIStreamChunk } from "@/types/ai";

// ── Helper: collect all chunks from an async generator ──────────────────────

async function collect(gen: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
    const chunks: AIStreamChunk[] = [];
    for await (const chunk of gen) chunks.push(chunk);
    return chunks;
}

/** Build an async iterable from an array of chunks */
async function* fromChunks(chunks: AIStreamChunk[]): AsyncIterable<AIStreamChunk> {
    for (const c of chunks) yield c;
}

// ── parseChoicesBlock ───────────────────────────────────────────────────────

describe("parseChoicesBlock", () => {
    it("parses a valid block with 3 choices", () => {
        const xml = `<choices>
            <choice>Define PICO criteria</choice>
            <choice>Search PubMed</choice>
            <choice>Start drafting</choice>
        </choices>`;
        const result = parseChoicesBlock(xml);
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ label: "Define PICO criteria", value: "Define PICO criteria", icon: undefined });
        expect(result[1]).toEqual({ label: "Search PubMed", value: "Search PubMed", icon: undefined });
        expect(result[2]).toEqual({ label: "Start drafting", value: "Start drafting", icon: undefined });
    });

    it("parses icon attributes", () => {
        const xml = `<choices>
            <choice icon="search">Search PubMed</choice>
            <choice icon="edit_note">Start drafting</choice>
        </choices>`;
        const result = parseChoicesBlock(xml);
        expect(result).toHaveLength(2);
        expect(result[0].icon).toBe("search");
        expect(result[1].icon).toBe("edit_note");
    });

    it("returns [] for 1 choice (below minimum)", () => {
        const xml = `<choices><choice>Only one</choice></choices>`;
        expect(parseChoicesBlock(xml)).toEqual([]);
    });

    it("returns [] for 6 choices (above maximum)", () => {
        const xml = `<choices>
            <choice>A</choice><choice>B</choice><choice>C</choice>
            <choice>D</choice><choice>E</choice><choice>F</choice>
        </choices>`;
        expect(parseChoicesBlock(xml)).toEqual([]);
    });

    it("deduplicates by value", () => {
        const xml = `<choices>
            <choice>Option A</choice>
            <choice>Option B</choice>
            <choice>Option A</choice>
        </choices>`;
        const result = parseChoicesBlock(xml);
        expect(result).toHaveLength(2);
    });

    it("truncates labels longer than 80 chars", () => {
        const longLabel = "A".repeat(100);
        const xml = `<choices>
            <choice>${longLabel}</choice>
            <choice>Short</choice>
        </choices>`;
        const result = parseChoicesBlock(xml);
        expect(result[0].label).toHaveLength(80);
    });

    it("strips HTML from labels", () => {
        const xml = `<choices>
            <choice><b>Bold</b> text</choice>
            <choice>Normal text</choice>
        </choices>`;
        const result = parseChoicesBlock(xml);
        expect(result[0].label).toBe("Bold text");
    });

    it("skips empty choice tags", () => {
        const xml = `<choices>
            <choice></choice>
            <choice>Real option</choice>
            <choice>Another option</choice>
        </choices>`;
        const result = parseChoicesBlock(xml);
        expect(result).toHaveLength(2);
    });

    it("returns [] for malformed XML (no closing tag)", () => {
        const xml = `<choices><choice>Unclosed`;
        expect(parseChoicesBlock(xml)).toEqual([]);
    });

    it("returns [] for empty string", () => {
        expect(parseChoicesBlock("")).toEqual([]);
    });

    it("handles case-insensitive tags", () => {
        const xml = `<CHOICES>
            <CHOICE>Option A</CHOICE>
            <Choice>Option B</Choice>
        </CHOICES>`;
        const result = parseChoicesBlock(xml);
        expect(result).toHaveLength(2);
    });
});

// ── withChoicesExtraction ───────────────────────────────────────────────────

describe("withChoicesExtraction", () => {
    it("passes through normal content without choices", async () => {
        const input: AIStreamChunk[] = [
            { type: "content", content: "Hello " },
            { type: "content", content: "world!" },
            { type: "done" },
        ];
        const result = await collect(withChoicesExtraction(fromChunks(input)));

        const contentChunks = result.filter((c) => c.type === "content");
        const fullText = contentChunks.map((c) => c.content).join("");
        expect(fullText).toBe("Hello world!");
        expect(result.some((c) => c.type === "choices")).toBe(false);
        // done must come AFTER all content chunks
        const doneIdx = result.findIndex((c) => c.type === "done");
        const lastContentIdx = result.reduce((acc, c, i) => c.type === "content" ? i : acc, -1);
        expect(doneIdx).toBeGreaterThan(lastContentIdx);
    });

    it("extracts choices block and yields clean content + choices event", async () => {
        const input: AIStreamChunk[] = [
            { type: "content", content: "What would you like to do?\n\n" },
            { type: "content", content: '<choices><choice>Option A</choice><choice>Option B</choice></choices>' },
            { type: "done" },
        ];
        const result = await collect(withChoicesExtraction(fromChunks(input)));

        const contentChunks = result.filter((c) => c.type === "content");
        const fullText = contentChunks.map((c) => c.content).join("");
        expect(fullText).toBe("What would you like to do?\n\n");

        const choicesChunk = result.find((c) => c.type === "choices");
        expect(choicesChunk).toBeDefined();
        expect(choicesChunk!.choices).toHaveLength(2);
        expect(choicesChunk!.choices![0].label).toBe("Option A");
    });

    it("handles <choices split across two chunks", async () => {
        const input: AIStreamChunk[] = [
            { type: "content", content: "Pick one:\n\n<cho" },
            { type: "content", content: 'ices><choice>A</choice><choice>B</choice></choices>' },
            { type: "done" },
        ];
        const result = await collect(withChoicesExtraction(fromChunks(input)));

        const contentChunks = result.filter((c) => c.type === "content");
        const fullText = contentChunks.map((c) => c.content).join("");
        expect(fullText).toBe("Pick one:\n\n");

        const choicesChunk = result.find((c) => c.type === "choices");
        expect(choicesChunk).toBeDefined();
        expect(choicesChunk!.choices).toHaveLength(2);
    });

    it("falls back to tag-stripped content when choices block has only 1 option", async () => {
        const input: AIStreamChunk[] = [
            { type: "content", content: "Here: " },
            { type: "content", content: "<choices><choice>Only one</choice></choices>" },
            { type: "done" },
        ];
        const result = await collect(withChoicesExtraction(fromChunks(input)));

        // No choices event — invalid block flushed as tag-stripped content
        expect(result.some((c) => c.type === "choices")).toBe(false);
        const contentChunks = result.filter((c) => c.type === "content");
        const fullText = contentChunks.map((c) => c.content).join("");
        expect(fullText).toContain("Only one");
        // Raw XML tags must never leak to the user
        expect(fullText).not.toContain("<choices");
        expect(fullText).not.toContain("<choice");
        expect(fullText).not.toContain("</");
    });

    it("passes through non-content chunks untouched", async () => {
        const toolCall = { id: "tc1", name: "search_pubmed", arguments: {} };
        const input: AIStreamChunk[] = [
            { type: "tool_call", toolCall },
            { type: "content", content: "Some text" },
            { type: "error", error: "something broke" },
            { type: "done" },
        ];
        const result = await collect(withChoicesExtraction(fromChunks(input)));

        expect(result[0]).toEqual({ type: "tool_call", toolCall });
        const errorChunk = result.find((c) => c.type === "error");
        expect(errorChunk?.error).toBe("something broke");
        expect(result.some((c) => c.type === "done")).toBe(true);
    });

    it("produces no output for empty stream", async () => {
        const result = await collect(withChoicesExtraction(fromChunks([])));
        expect(result).toEqual([]);
    });

    it("handles stream abort mid-buffering — no choices emitted", async () => {
        // Simulate an abort: stream yields content with <choices start but never finishes
        async function* abortingStream(): AsyncIterable<AIStreamChunk> {
            yield { type: "content", content: "Question?\n\n<choices><choice>A</choice>" };
            // Stream aborts here — no more chunks, no closing tag
        }
        const result = await collect(withChoicesExtraction(abortingStream()));

        // Should flush the buffered text as content fallback (invalid — only 1 choice)
        expect(result.some((c) => c.type === "choices")).toBe(false);
        const contentChunks = result.filter((c) => c.type === "content");
        const fullText = contentChunks.map((c) => c.content).join("");
        // The content before <choices is yielded, and the invalid block is flushed
        expect(fullText).toContain("Question?");
    });

    it("handles choices block streamed one char at a time", async () => {
        const full = 'Great!\n<choices><choice>Yes</choice><choice>No</choice></choices>';
        const chars: AIStreamChunk[] = full.split("").map((c) => ({ type: "content" as const, content: c }));

        const result = await collect(withChoicesExtraction(fromChunks(chars)));

        const contentChunks = result.filter((c) => c.type === "content");
        const fullText = contentChunks.map((c) => c.content).join("");
        expect(fullText).toBe("Great!\n");

        const choicesChunk = result.find((c) => c.type === "choices");
        expect(choicesChunk).toBeDefined();
        expect(choicesChunk!.choices).toHaveLength(2);
    });
});
