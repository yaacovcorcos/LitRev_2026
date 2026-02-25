import { describe, expect, it } from "vitest";
import { isNavigationSafe } from "@/lib/ai/navigation-safety";

describe("isNavigationSafe", () => {
    it("allows root path", () => {
        expect(isNavigationSafe("/")).toBe(true);
    });

    it("allows project path", () => {
        expect(isNavigationSafe("/project/abc-123")).toBe(true);
    });

    it("allows project with underscore id", () => {
        expect(isNavigationSafe("/project/my_project_1")).toBe(true);
    });

    it("allows project path with protocol page", () => {
        expect(isNavigationSafe("/project/abc-123/protocol")).toBe(true);
    });

    it("allows project path with ledger page", () => {
        expect(isNavigationSafe("/project/abc-123/ledger")).toBe(true);
    });

    it("allows project path with draft page", () => {
        expect(isNavigationSafe("/project/abc-123/draft")).toBe(true);
    });

    it("allows project path with onboarding page", () => {
        expect(isNavigationSafe("/project/abc-123/onboarding")).toBe(true);
    });

    it("rejects protocol-relative URLs", () => {
        expect(isNavigationSafe("//evil.com")).toBe(false);
    });

    it("rejects absolute URLs with scheme", () => {
        expect(isNavigationSafe("https://evil.com")).toBe(false);
    });

    it("rejects javascript protocol", () => {
        expect(isNavigationSafe("javascript:alert(1)")).toBe(false);
    });

    it("rejects empty string", () => {
        expect(isNavigationSafe("")).toBe(false);
    });

    it("rejects paths outside allowlist", () => {
        expect(isNavigationSafe("/admin")).toBe(false);
        expect(isNavigationSafe("/settings")).toBe(false);
        expect(isNavigationSafe("/project/abc/unknown-page")).toBe(false);
    });

    it("rejects project path with extra segments", () => {
        expect(isNavigationSafe("/project/abc/protocol/extra")).toBe(false);
    });
});
