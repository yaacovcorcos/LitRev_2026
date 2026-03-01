"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/* ── Types ──────────────────────────────────────────────────── */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** User-chosen preference (persisted to localStorage). */
  theme: ThemePreference;
  /** The currently active appearance. */
  resolved: ResolvedTheme;
  /** Change the theme preference. */
  setTheme: (next: ThemePreference) => void;
}

const STORAGE_KEY = "litrev-theme";

/* ── Context ────────────────────────────────────────────────── */

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

/* ── Helpers ────────────────────────────────────────────────── */

function getSystemPreference(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? getSystemPreference() : pref;
}

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function applyToDOM(resolved: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", resolved);
}

/* ── Provider ───────────────────────────────────────────────── */

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStored);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readStored()));

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    const r = resolve(next);
    setResolved(r);
    applyToDOM(r);
  }, []);

  /* Sync on mount (handles SSR → client handoff) */
  useEffect(() => {
    const r = resolve(theme);
    setResolved(r);
    applyToDOM(r);
  }, [theme]);

  /* Listen for OS preference changes when in "system" mode */
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme !== "system") return;
      const r = mq.matches ? "dark" : "light";
      setResolved(r);
      applyToDOM(r);
    };
    /* Safari <14 only has addListener/removeListener */
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
    } else if (mq.addListener) {
      mq.addListener(handler);
    }
    return () => {
      if (mq.removeEventListener) {
        mq.removeEventListener("change", handler);
      } else if (mq.removeListener) {
        mq.removeListener(handler);
      }
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
