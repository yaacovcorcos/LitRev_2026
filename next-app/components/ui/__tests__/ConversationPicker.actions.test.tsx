// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationPicker } from "../ConversationPicker";

vi.mock("@radix-ui/react-popover", () => ({
  Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@radix-ui/react-dropdown-menu", () => ({
  Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Item: ({
    children,
    onSelect,
    className,
  }: {
    children: ReactNode;
    onSelect?: (event: Event) => void;
    className?: string;
  }) => (
    <button type="button" className={className} onClick={() => onSelect?.({ preventDefault() {} } as Event)}>
      {children}
    </button>
  ),
}));

// Keep ContextMenu inert in tests; actions are exercised through dropdown trigger.
vi.mock("@radix-ui/react-context-menu", () => ({
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: () => null,
  Content: () => null,
  Item: () => null,
}));

vi.mock("@radix-ui/react-dialog", () => ({
  Root: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Overlay: ({ className }: { className?: string }) => <div className={className} />,
  Content: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
  Title: ({ children, className }: { children: ReactNode; className?: string }) => <h2 className={className}>{children}</h2>,
}));

describe("ConversationPicker actions", () => {
  const baseProps = {
    variant: "page" as const,
    open: true,
    onOpenChange: vi.fn(),
    currentConversationId: "c1",
    currentTitle: "Conversation A",
    conversations: [
      { id: "c1", title: "Conversation A", updatedAt: "2026-02-21T00:00:00.000Z", messageCount: 5 },
    ],
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renames via dialog flow without using window.prompt", async () => {
    const onRename = vi.fn(async () => {});
    const promptSpy = vi.spyOn(window, "prompt");

    render(
      <ConversationPicker
        {...baseProps}
        onRename={onRename}
      />,
    );

    fireEvent.click(screen.getByText("Rename").closest("button") as HTMLButtonElement);

    const input = await screen.findByLabelText("Conversation name");
    fireEvent.change(input, { target: { value: "  Renamed Conversation  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith("c1", "Renamed Conversation");
    });
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("runs duplicate and delete actions from menu", () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConversationPicker
        {...baseProps}
        onOpenChange={onOpenChange}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("Duplicate").closest("button") as HTMLButtonElement);
    fireEvent.click(screen.getByText("Delete").closest("button") as HTMLButtonElement);

    expect(onDuplicate).toHaveBeenCalledWith("c1");
    expect(onDelete).toHaveBeenCalledWith("c1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
