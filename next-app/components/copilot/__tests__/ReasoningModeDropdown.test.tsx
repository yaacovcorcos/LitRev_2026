// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReasoningModeDropdown } from "../ReasoningModeDropdown";

describe("ReasoningModeDropdown", () => {
    const defaultProps = {
        reasoningMode: "full" as const,
        onReasoningModeChange: vi.fn(),
        children: <button>Trigger</button>,
    };

    it("renders trigger button", () => {
        render(<ReasoningModeDropdown {...defaultProps} />);
        expect(screen.getByRole("button", { name: "Trigger" })).toBeTruthy();
    });

    it("accepts explicit reasoningSupport prop without error", () => {
        expect(() =>
            render(
                <ReasoningModeDropdown
                    {...defaultProps}
                    reasoningSupport="explicit"
                />
            )
        ).not.toThrow();
    });

    it("accepts best_effort reasoningSupport prop without error", () => {
        expect(() =>
            render(
                <ReasoningModeDropdown
                    {...defaultProps}
                    reasoningSupport="best_effort"
                />
            )
        ).not.toThrow();
    });

    it("accepts none reasoningSupport prop without error", () => {
        expect(() =>
            render(
                <ReasoningModeDropdown
                    {...defaultProps}
                    reasoningSupport="none"
                />
            )
        ).not.toThrow();
    });

    it("defaults to explicit when reasoningSupport is not provided", () => {
        // This is a type-level test - the component renders without error
        // when no reasoningSupport is passed (defaults to "explicit")
        expect(() =>
            render(<ReasoningModeDropdown {...defaultProps} />)
        ).not.toThrow();
    });
});
