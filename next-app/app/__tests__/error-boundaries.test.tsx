// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import RootError from "../error";
import GlobalError from "../global-error";

vi.mock("@/components/ErrorFallback", () => ({
  ErrorFallback: ({
    title,
    message,
    onRetry,
  }: {
    title?: string;
    message: string;
    onRetry: () => void;
  }) => (
    <section role="alert">
      {title ? <h1>{title}</h1> : null}
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </section>
  ),
}));

function renderGlobalError(children: ReactNode) {
  const wrapper = document.createElement("div");
  document.body.appendChild(wrapper);
  return render(children, { container: wrapper });
}

describe("app error boundaries", () => {
  it("renders a branded retry fallback for root route failures", () => {
    const reset = vi.fn();

    render(<RootError error={new Error("boom")} reset={reset} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("LitRev could not load this page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders a full document fallback for unrecoverable global failures", () => {
    const reset = vi.fn();

    renderGlobalError(<GlobalError error={new Error("boom")} reset={reset} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("LitRev could not recover this page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
