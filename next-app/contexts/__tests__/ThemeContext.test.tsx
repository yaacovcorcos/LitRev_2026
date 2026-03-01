// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "../ThemeContext";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe("ThemeContext", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to system preference (light when matchMedia unavailable)", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("system");
    expect(result.current.resolved).toBe("light");
  });

  it("cycles light → dark → system and updates data-theme", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setTheme("light"));
    expect(result.current.theme).toBe("light");
    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe("dark");
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    act(() => result.current.setTheme("system"));
    expect(result.current.theme).toBe("system");
    // system resolves to light in jsdom (no matchMedia)
    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("persists preference to localStorage", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setTheme("dark"));
    expect(localStorage.getItem("litrev-theme")).toBe("dark");

    act(() => result.current.setTheme("light"));
    expect(localStorage.getItem("litrev-theme")).toBe("light");
  });

  it("reads stored preference on mount", () => {
    localStorage.setItem("litrev-theme", "dark");

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("throws when useTheme is called outside ThemeProvider", () => {
    expect(() => {
      renderHook(() => useTheme());
    }).toThrow("useTheme must be used within ThemeProvider");
  });
});
