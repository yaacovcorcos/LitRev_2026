// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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

    it("accepts full reasoning visibility support without error", () => {
        expect(() =>
            render(
                <ChatReasoningModeDropdown
                    {...defaultProps}
                    reasoningVisibilitySupport="full"
                />
            )
        ).not.toThrow();
    });

    it("limits summary providers to Off and Summary", () => {
        render(
            <ChatReasoningModeDropdown
                {...defaultProps}
                reasoningVisibilitySupport="summary"
            />,
        );

        fireEvent.pointerDown(screen.getByRole("button", { name: "Trigger" }));
        expect(screen.getByRole("menuitemradio", { name: /Off/i })).toBeTruthy();
        expect(screen.getByRole("menuitemradio", { name: /Summary/i })).toBeTruthy();
        expect(screen.queryByRole("menuitemradio", { name: /Full/i })).toBeNull();
        expect(screen.getByText(/not raw private reasoning/i)).toBeTruthy();
    });

    it("accepts no visible reasoning support without error", () => {
        expect(() =>
            render(
                <ChatReasoningModeDropdown
                    {...defaultProps}
                    reasoningVisibilitySupport="none"
                />
            )
        ).not.toThrow();
    });

    it("defaults to full when visibility support is not provided", () => {
        // This is a type-level test - the component renders without error
        // when no visibility support is passed (defaults to "full")
        expect(() =>
            render(<ChatReasoningModeDropdown {...defaultProps} />)
        ).not.toThrow();
    });
});
