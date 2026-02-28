// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotificationProvider,
  useNotifications,
} from "../NotificationContext";
import { NOTIFICATION_EVENT } from "@/hooks/useAsyncAction";

function TestConsumer() {
  const { notifications, notify, dismiss } = useNotifications();
  return (
    <div>
      <button onClick={() => notify("success", "Saved!")}>
        Notify Success
      </button>
      <button onClick={() => notify("error", "Failed!")}>
        Notify Error
      </button>
      <div data-testid="count">{notifications.length}</div>
      {notifications.map((n) => (
        <div key={n.id} data-testid={`notification-${n.type}`}>
          <span>{n.message}</span>
          <button onClick={() => dismiss(n.id)}>Dismiss</button>
        </div>
      ))}
    </div>
  );
}

describe("NotificationContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws when useNotifications is used outside provider", () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useNotifications must be used within NotificationProvider",
    );
    spy.mockRestore();
  });

  it("adds and displays notifications via notify()", () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>,
    );

    act(() => {
      screen.getByText("Notify Success").click();
    });

    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("notification-success")).toBeTruthy();
    expect(screen.getByText("Saved!")).toBeTruthy();
  });

  it("auto-dismisses success notifications after 4 seconds", () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>,
    );

    act(() => {
      screen.getByText("Notify Success").click();
    });
    expect(screen.getByTestId("count").textContent).toBe("1");

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("auto-dismisses error notifications after 8 seconds", () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>,
    );

    act(() => {
      screen.getByText("Notify Error").click();
    });
    expect(screen.getByTestId("count").textContent).toBe("1");

    // Still present at 4s
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByTestId("count").textContent).toBe("1");

    // Gone at 8s
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("manually dismisses a notification", () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>,
    );

    act(() => {
      screen.getByText("Notify Success").click();
    });
    expect(screen.getByTestId("count").textContent).toBe("1");

    act(() => {
      screen.getByText("Dismiss").click();
    });
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("deduplicates rapid-fire identical notifications", () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>,
    );

    act(() => {
      screen.getByText("Notify Success").click();
      screen.getByText("Notify Success").click();
      screen.getByText("Notify Success").click();
    });

    // Should only show 1 due to dedup within 500ms window
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("listens for custom DOM events from useAsyncAction", () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(NOTIFICATION_EVENT, {
          detail: { type: "info", message: "From hook" },
        }),
      );
    });

    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByText("From hook")).toBeTruthy();
  });

  it("caps visible notifications at 5", () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>,
    );

    // Dispatch 7 unique notifications
    for (let i = 0; i < 7; i++) {
      act(() => {
        window.dispatchEvent(
          new CustomEvent(NOTIFICATION_EVENT, {
            detail: { type: "info", message: `Message ${i}` },
          }),
        );
      });
    }

    expect(screen.getByTestId("count").textContent).toBe("5");
    // Should keep the latest 5
    expect(screen.getByText("Message 6")).toBeTruthy();
    expect(screen.getByText("Message 2")).toBeTruthy();
  });
});
