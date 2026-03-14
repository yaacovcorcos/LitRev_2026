import { describe, expect, it } from "vitest";
import {
    resolveComposerAutoMode,
    resolveComposerMode,
    type ComposerModeSelection,
} from "../composer-mode-selection";

describe("resolveComposerAutoMode", () => {
    it("uses the existing router rules in auto mode", () => {
        expect(resolveComposerAutoMode({
            message: "Search PubMed for diabetes trials",
            page: "overview",
        })).toBe("search");
    });

    it("keeps protocol page routing in auto mode", () => {
        expect(resolveComposerAutoMode({
            message: "hello world",
            page: "protocol",
        })).toBe("protocol");
    });

    it("preserves scoping when protocol-like phrasing appears without explicit switch intent", () => {
        expect(resolveComposerAutoMode({
            message: "Should I tighten my inclusion criteria now?",
            page: "overview",
            previousAutoMode: "scoping",
        })).toBe("scoping");
    });

    it("allows explicit protocol switch intent to take effect", () => {
        expect(resolveComposerAutoMode({
            message: "Switch to protocol mode and update the criteria",
            page: "overview",
            previousAutoMode: "scoping",
        })).toBe("protocol");
    });
});

describe("resolveComposerMode", () => {
    it("respects sticky manual mode over auto routing", () => {
        const selection: ComposerModeSelection = { kind: "manual", mode: "protocol" };
        expect(resolveComposerMode({
            selection,
            message: "Search PubMed for diabetes trials",
            page: "overview",
        })).toBe("protocol");
    });
});
