// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { ConversationPicker } from "../ConversationPicker";

describe("ConversationPicker accessibility", () => {
  it("has no obvious axe violations in open state", async () => {
    const { container } = render(
      <ConversationPicker
        variant="page"
        open
        onOpenChange={vi.fn()}
        currentConversationId="c1"
        currentTitle="Conversation A"
        conversations={[
          { id: "c1", title: "Conversation A", updatedAt: "2026-02-21T00:00:00.000Z", messageCount: 5 },
          { id: "c2", title: "Conversation B", updatedAt: "2026-02-20T00:00:00.000Z", messageCount: 2 },
        ]}
        onSelect={vi.fn()}
        renderMeta={(conversation) => `${conversation.messageCount} msgs`}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  }, 15000);
});
