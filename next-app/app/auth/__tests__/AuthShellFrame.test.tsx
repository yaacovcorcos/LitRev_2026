// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthShellFrame } from "../AuthShellFrame";

describe("AuthShellFrame", () => {
  it("renders a shared auth shell with route-level height ownership", () => {
    render(
      <AuthShellFrame ariaLabel="Sign in" mode="signin">
        <div>Auth content</div>
      </AuthShellFrame>,
    );

    const main = screen.getByRole("main");
    expect(main.getAttribute("data-surface-height")).toBe("phone-min");
    expect(main.getAttribute("data-auth-shell")).toBe("true");
    expect(screen.getByLabelText("Sign in")).toBeTruthy();
    expect(screen.getByText("LitRev")).toBeTruthy();
    expect(screen.getByText("Auth content")).toBeTruthy();
  });
});
