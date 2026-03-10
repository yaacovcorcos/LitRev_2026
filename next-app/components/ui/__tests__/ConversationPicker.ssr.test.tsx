import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConversationPicker } from "../ConversationPicker";

describe("ConversationPicker SSR", () => {
  it("renders a stable non-Radix trigger before hydration", () => {
    const html = renderToString(
      <ConversationPicker
        variant="page"
        open={false}
        onOpenChange={vi.fn()}
        currentConversationId="c1"
        currentTitle="Conversation A"
        conversations={[
          { id: "c1", title: "Conversation A", updatedAt: "2026-02-21T00:00:00.000Z", messageCount: 5 },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain("Select conversation");
    expect(html).not.toContain("aria-controls=");
    expect(html).not.toContain("radix-");
  });
});
