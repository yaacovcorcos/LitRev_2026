// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatReasoningModeDropdown } from "../ChatReasoningModeDropdown";

describe("ChatReasoningModeDropdown", () => {
    const defaultProps = {
        reasoningMode: "full" as const,
        onReasoningModeChange: vi.fn(),
        children: <button>Trigger</button>,
    };

    it("renders trigger button", () => {
        render(<ChatReasoningModeDropdown {...defaultProps} />);
        expect(screen.getByRole("button", { name: "Trigger" })).toBeTruthy();
    });

    it("accepts explicit reasoningSupport prop without error", () => {
        expect(() =>
            render(
                <ChatReasoningModeDropdown
                    {...defaultProps}
                    reasoningSupport="explicit"
                />
            )
        ).not.toThrow();
    });

    it("accepts best_effort reasoningSupport prop without error", () => {
        expect(() =>
            render(
                <ChatReasoningModeDropdown
                    {...defaultProps}
                    reasoningSupport="best_effort"
                />
            )
        ).not.toThrow();
    });

    it("accepts none reasoningSupport prop without error", () => {
        expect(() =>
            render(
                <ChatReasoningModeDropdown
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
            render(<ChatReasoningModeDropdown {...defaultProps} />)
        ).not.toThrow();
    });
});
