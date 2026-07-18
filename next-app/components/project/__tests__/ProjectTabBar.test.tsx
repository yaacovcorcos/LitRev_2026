// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectTabBar } from "../ProjectTabBar";
import { COARSE_POINTER_MEDIA_QUERY, MOBILE_VIEWPORT_MEDIA_QUERY } from "@/lib/mobile/breakpoints";

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
        isConversationLoading: false,
    };

    beforeEach(() => {
        mockWarmDomain.mockClear();
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })) as typeof window.matchMedia;
    });

    it("calls warmDomain on tab hover for protocol", () => {
        render(<ProjectTabBar {...defaultProps} />);
        const protocolTab = screen.getByRole("tab", { name: /Protocol/i });
        fireEvent.mouseEnter(protocolTab);
        expect(mockWarmDomain).toHaveBeenCalledWith("protocol");
    });

    it("calls warmDomain on tab hover for ledger", () => {
        render(<ProjectTabBar {...defaultProps} />);
        const ledgerTab = screen.getByRole("tab", { name: /Ledger/i });
        fireEvent.mouseEnter(ledgerTab);
        expect(mockWarmDomain).toHaveBeenCalledWith("ledger");
    });

    it("does not call warmDomain on tab hover for draft", () => {
        render(<ProjectTabBar {...defaultProps} />);
        const draftTab = screen.getByRole("tab", { name: /Draft/i });
        fireEvent.mouseEnter(draftTab);
        expect(mockWarmDomain).not.toHaveBeenCalled();
    });

    it("moves memory into project settings instead of the main tab row", () => {
        render(<ProjectTabBar {...defaultProps} />);
        expect(screen.queryByRole("tab", { name: /Memory/i })).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Project settings" }));
        const memoryAction = screen.getByRole("menuitem", { name: /Memory/i });
        fireEvent.mouseEnter(memoryAction);
        expect(mockWarmDomain).not.toHaveBeenCalled();
    });

    it("opens memory from the project settings menu", () => {
        const onTabClick = vi.fn();
        render(<ProjectTabBar {...defaultProps} onTabClick={onTabClick} />);

        fireEvent.click(screen.getByRole("button", { name: "Project settings" }));
        fireEvent.click(screen.getByRole("menuitem", { name: /Memory/i }));

        expect(onTabClick).toHaveBeenCalledWith("memory");
    });

    it("does not call warmDomain on tab hover for notes", () => {
        render(<ProjectTabBar {...defaultProps} />);
        const notesTab = screen.getByRole("tab", { name: /Notes/i });
        fireEvent.mouseEnter(notesTab);
        expect(mockWarmDomain).not.toHaveBeenCalled();
    });

    it("does NOT call warmDomain for overview tab", () => {
        render(<ProjectTabBar {...defaultProps} />);
        const overviewTab = screen.getByRole("tab", { name: /Overview/i });
        fireEvent.mouseEnter(overviewTab);
        expect(mockWarmDomain).not.toHaveBeenCalled();
    });

    it("does not call warmDomain on tab focus", () => {
        render(<ProjectTabBar {...defaultProps} />);
        const ledgerTab = screen.getByRole("tab", { name: /Ledger/i });
        fireEvent.focus(ledgerTab);
        expect(mockWarmDomain).not.toHaveBeenCalled();
    });

    it("holds conversation navigation until durable conversations finish loading", () => {
        const onConversationClick = vi.fn();
        render(
            <ProjectTabBar
                {...defaultProps}
                isConversationLoading
                onConversationClick={onConversationClick}
            />,
        );

        const conversationMode = screen.getByRole("radio", { name: "Conversation mode" });
        expect((conversationMode as HTMLButtonElement).disabled).toBe(true);
        expect(conversationMode.getAttribute("aria-busy")).toBe("true");
        fireEvent.click(conversationMode);
        expect(onConversationClick).not.toHaveBeenCalled();
    });

    it("does not warm domains on coarse-pointer or mobile contexts", () => {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === COARSE_POINTER_MEDIA_QUERY || query === MOBILE_VIEWPORT_MEDIA_QUERY,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })) as typeof window.matchMedia;

        render(<ProjectTabBar {...defaultProps} />);
        const protocolTab = screen.getByRole("tab", { name: /Protocol/i });
        fireEvent.mouseEnter(protocolTab);
        expect(mockWarmDomain).not.toHaveBeenCalled();
    });
});
