import { describe, it, expect } from "vitest";
import { getSuggestions, type ProjectStateSnapshot } from "../suggestions";

const emptyState: ProjectStateSnapshot = {
    hasProtocol: false,
    studyCount: 0,
    unscreenedCount: 0,
    includedCount: 0,
    excludedCount: 0,
    maybeCount: 0,
};

describe("getSuggestions", () => {
    it("suggests Define PICO first when no protocol exists", () => {
        const chips = getSuggestions(emptyState);
        expect(chips[0].label).toBe("Define PICO");
        expect(chips[0].mode).toBe("protocol");
    });

    it("suggests Search PubMed when protocol exists but no studies", () => {
        const chips = getSuggestions({ ...emptyState, hasProtocol: true });
        expect(chips[0].label).toBe("Search PubMed");
        expect(chips[0].mode).toBe("search");
    });

    it("suggests screening when unscreened studies exist", () => {
        const chips = getSuggestions({
            ...emptyState,
            hasProtocol: true,
            studyCount: 5,
            unscreenedCount: 3,
        });
        expect(chips[0].label).toBe("Screen 3 studies");
        expect(chips[0].mode).toBe("screening");
    });

    it("uses singular form for 1 study", () => {
        const chips = getSuggestions({
            ...emptyState,
            hasProtocol: true,
            studyCount: 1,
            unscreenedCount: 1,
        });
        expect(chips[0].label).toBe("Screen 1 study");
    });

    it("suggests reviewing maybes when present", () => {
        const chips = getSuggestions({
            ...emptyState,
            hasProtocol: true,
            studyCount: 10,
            unscreenedCount: 0,
            maybeCount: 4,
        });
        expect(chips.find(c => c.label === "Review 4 maybes")).toBeDefined();
    });

    it("suggests drafting when 3+ studies included", () => {
        const chips = getSuggestions({
            ...emptyState,
            hasProtocol: true,
            studyCount: 10,
            unscreenedCount: 0,
            includedCount: 5,
        });
        expect(chips.find(c => c.label === "Start drafting")).toBeDefined();
        expect(chips.find(c => c.label === "Check citations")).toBeDefined();
    });

    it("returns at most 4 chips", () => {
        const chips = getSuggestions({
            hasProtocol: true,
            studyCount: 10,
            unscreenedCount: 3,
            includedCount: 5,
            excludedCount: 1,
            maybeCount: 2,
        });
        expect(chips.length).toBeLessThanOrEqual(4);
    });

    it("always includes general fallback when fewer than 4 chips match", () => {
        const chips = getSuggestions(emptyState);
        expect(chips[chips.length - 1].label).toBe("Ask anything");
        expect(chips[chips.length - 1].mode).toBe("general");
    });

    it("includes a non-empty description on every chip", () => {
        const chips = getSuggestions(emptyState);
        for (const chip of chips) {
            expect(chip.description.trim().length).toBeGreaterThan(0);
        }
    });

    it("does not suggest Search PubMed when studies already exist", () => {
        const chips = getSuggestions({
            ...emptyState,
            hasProtocol: true,
            studyCount: 5,
            unscreenedCount: 5,
        });
        expect(chips.find(c => c.label === "Search PubMed")).toBeUndefined();
    });
});
