import { describe, it, expect, vi } from "vitest";
import { safeParseJson, parseToolArgs } from "@/lib/server/ai/json-repair";

describe("safeParseJson", () => {
    // ── Fast path (valid JSON) ──────────────────────────────────────────────

    it("parses valid JSON object on fast path", () => {
        const result = safeParseJson('{"name": "search_pubmed", "query": "statins"}');
        expect(result).toEqual({ name: "search_pubmed", query: "statins" });
    });

    it("parses valid JSON array on fast path", () => {
        const result = safeParseJson('[1, 2, 3]');
        expect(result).toEqual([1, 2, 3]);
    });

    it("parses deeply nested valid JSON on fast path", () => {
        const input = JSON.stringify({ a: { b: { c: [1, { d: "e" }] } } });
        expect(safeParseJson(input)).toEqual({ a: { b: { c: [1, { d: "e" }] } } });
    });

    it("parses valid JSON string primitive", () => {
        expect(safeParseJson('"hello"')).toBe("hello");
    });

    it("parses valid JSON number", () => {
        expect(safeParseJson("42")).toBe(42);
    });

    // ── Trailing commas ─────────────────────────────────────────────────────

    it("repairs trailing comma before closing brace", () => {
        const result = safeParseJson('{"query": "statins",}');
        expect(result).toEqual({ query: "statins" });
    });

    it("repairs trailing comma before closing bracket", () => {
        const result = safeParseJson('["a", "b",]');
        expect(result).toEqual(["a", "b"]);
    });

    it("repairs multiple trailing commas", () => {
        const result = safeParseJson('{"a": 1, "b": [2, 3,],}');
        expect(result).toEqual({ a: 1, b: [2, 3] });
    });

    // ── Markdown code fences ────────────────────────────────────────────────

    it("strips ```json code fence", () => {
        const result = safeParseJson('```json\n{"key": "value"}\n```');
        expect(result).toEqual({ key: "value" });
    });

    it("strips ``` code fence (no language tag)", () => {
        const result = safeParseJson('```\n{"key": "value"}\n```');
        expect(result).toEqual({ key: "value" });
    });

    it("strips code fence with trailing comma inside", () => {
        const result = safeParseJson('```json\n{"key": "value",}\n```');
        expect(result).toEqual({ key: "value" });
    });

    // ── Object extraction ───────────────────────────────────────────────────

    it("extracts JSON object from surrounding text", () => {
        const result = safeParseJson('Here is the result: {"action": "search"} and more text');
        expect(result).toEqual({ action: "search" });
    });

    it("extracts first JSON object when multiple exist", () => {
        const result = safeParseJson('{"first": true} some text {"second": true}');
        // Fast path should parse the valid JSON... but it has extra content.
        // The extraction step will get the first object.
        expect(result).toEqual({ first: true });
    });

    // ── Don't-over-repair cases ─────────────────────────────────────────────

    it("does not confuse braces inside quoted strings", () => {
        // This is valid JSON — braces in strings shouldn't cause issues
        const input = '{"message": "Use {curly} braces in {text}"}';
        const result = safeParseJson(input);
        expect(result).toEqual({ message: "Use {curly} braces in {text}" });
    });

    it("handles nested objects in extraction without grabbing too much", () => {
        // The extraction regex should handle one level of nesting
        const input = 'prefix {"outer": {"inner": 1}} suffix';
        const result = safeParseJson(input);
        expect(result).toEqual({ outer: { inner: 1 } });
    });

    // ── Null returns (unrecoverable) ────────────────────────────────────────

    it("returns null for empty string", () => {
        expect(safeParseJson("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
        expect(safeParseJson("   \n  ")).toBeNull();
    });

    it("returns null for completely invalid input", () => {
        expect(safeParseJson("this is not json at all")).toBeNull();
    });

    it("returns null for truncated JSON that can't be repaired", () => {
        // Missing value after colon — no simple repair can fix this
        expect(safeParseJson('{"key":')).toBeNull();
    });
});

describe("parseToolArgs", () => {
    it("returns parsed object for valid JSON", () => {
        const result = parseToolArgs('{"query": "test"}', "search_pubmed", "openai");
        expect(result).toEqual({ query: "test" });
    });

    it("returns {} and warns for invalid JSON", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = parseToolArgs("not json", "search_pubmed", "openai");
        expect(result).toEqual({});
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("[openai]"));
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("search_pubmed"));
        spy.mockRestore();
    });

    it("returns {} and warns for JSON array (not object)", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = parseToolArgs("[1, 2, 3]", "some_tool", "xai");
        expect(result).toEqual({});
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("[xai]"));
        spy.mockRestore();
    });

    it("returns {} and warns for JSON primitive", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = parseToolArgs('"hello"', "some_tool", "openai");
        expect(result).toEqual({});
        spy.mockRestore();
    });

    it("repairs and returns trailing-comma JSON without warning", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = parseToolArgs('{"query": "test",}', "search_pubmed", "openai");
        expect(result).toEqual({ query: "test" });
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
