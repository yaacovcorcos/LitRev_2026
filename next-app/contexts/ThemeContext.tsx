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

export type ThemePreference = "light" | "light-carbon" | "dark";
export type ResolvedTheme = "light" | "light-carbon" | "dark";

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref;
}

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "light-carbon" || raw === "dark") return raw;
    // Migrate legacy "system" (or invalid values) to policy-compliant light default.
    localStorage.setItem(STORAGE_KEY, "light");
  } catch {
    // Storage can be blocked in privacy modes; fail soft to light.
  }
  return "light";
}

function applyToDOM(resolved: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", resolved);
}

/* ── Provider ───────────────────────────────────────────────── */

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStored);
  const resolved = resolve(theme);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep runtime theme update even if persistence is unavailable.
    }
  }, []);

  /* Sync on mount (handles SSR → client handoff) */
  useEffect(() => {
    applyToDOM(resolved);
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
