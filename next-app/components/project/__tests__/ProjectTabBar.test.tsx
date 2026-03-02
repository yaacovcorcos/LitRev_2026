// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectTabBar } from "../ProjectTabBar";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockWarmDomain = vi.fn();

vi.mock("@/hooks/useProjectData", () => ({
    useProjectData: () => ({ warmDomain: mockWarmDomain }),
}));

// Cut transitive server-only import chains
vi.mock("../StatusIndicator", () => ({
    StatusIndicator: () => null,
}));

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "test-project" }),
    useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

describe("ProjectTabBar intent boost", () => {
    const defaultProps = {
        focusMode: "view" as const,
        activeTab: "overview" as const,
        onTabClick: vi.fn(),
        onConversationClick: vi.fn(),
    };

    it("calls warmDomain on tab hover for protocol", () => {
        render(<ProjectTabBar {...defaultProps} />);
        const protocolTab = screen.getByRole("tab", { name: /Protocol/i });
        fireEvent.mouseEnter(protocolTab);
        expect(mockWarmDomain).toHaveBeenCalledWith("protocol");
    });

    it("calls warmDomain on tab hover for draft", () => {
        render(<ProjectTabBar {...defaultProps} />);
        const draftTab = screen.getByRole("tab", { name: /Draft/i });
        fireEvent.mouseEnter(draftTab);
        expect(mockWarmDomain).toHaveBeenCalledWith("draft");
    });

    it("calls warmDomain on tab hover for memory", () => {
        mockWarmDomain.mockClear();
        render(<ProjectTabBar {...defaultProps} />);
        const memoryTab = screen.getByRole("tab", { name: /Memory/i });
        fireEvent.mouseEnter(memoryTab);
        expect(mockWarmDomain).toHaveBeenCalledWith("memory");
    });

    it("does NOT call warmDomain for overview tab", () => {
        mockWarmDomain.mockClear();
        render(<ProjectTabBar {...defaultProps} />);
        const overviewTab = screen.getByRole("tab", { name: /Overview/i });
        fireEvent.mouseEnter(overviewTab);
        expect(mockWarmDomain).not.toHaveBeenCalled();
    });

    it("calls warmDomain on tab focus for ledger", () => {
        mockWarmDomain.mockClear();
        render(<ProjectTabBar {...defaultProps} />);
        const ledgerTab = screen.getByRole("tab", { name: /Ledger/i });
        fireEvent.focus(ledgerTab);
        expect(mockWarmDomain).toHaveBeenCalledWith("ledger");
    });
});
