// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileNav } from "../MobileNav";
import type { NavLink } from "@/types/nav";

const LINKS: NavLink[] = [
  { label: "Home", icon: "home", href: "/", navKey: "projects" },
  { label: "New", icon: "add_circle", href: "#", navKey: "new" },
];

describe("MobileNav", () => {
  it("renders a sign out action and calls the callback", () => {
    const onSignOut = vi.fn();

    render(
      <MobileNav
        links={LINKS}
        onSignOut={onSignOut}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("shows signing out state and disables the action", () => {
    render(
      <MobileNav
        links={LINKS}
        onSignOut={() => {}}
        signOutBusy
      />,
    );

    const signOut = screen.getByRole("button", { name: /sign out/i });
    expect(signOut.getAttribute("disabled")).not.toBeNull();
    expect(signOut.textContent).toContain("Signing out...");
  });

  it("renders sign out errors", () => {
    render(
      <MobileNav
        links={LINKS}
        onSignOut={() => {}}
        signOutError="Sign out failed. Try again."
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Sign out failed. Try again.");
  });
});
