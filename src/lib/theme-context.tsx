"use client";

// Hand-rolled replacement for next-themes' ThemeProvider/useTheme.
//
// next-themes injects its no-flash-of-wrong-theme script by rendering a raw
// <script> element as part of its React tree (inside providers.tsx, a
// client component). Under React 19 + Next 16 that trips "Encountered a
// script tag while rendering React component" whenever that client
// component tree re-renders on the client — scripts rendered that way never
// execute on the client, only on the initial server-rendered HTML, so React
// now warns about it. Rather than fight that, this module does the same job
// without ever putting a <script> inside a client component: the no-flash
// script lives directly in the Server Component root layout's <head> (see
// src/app/layout.tsx) — plain server-rendered HTML, never part of a
// client-side re-render, so the warning doesn't apply — and this file is
// just a normal React context that reads/writes the same localStorage key
// and toggles the same `dark` class on <html> the old script used
// (tailwind.config.ts has `darkMode: "class"`, unchanged).

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Same key the inline no-flash script in layout.tsx reads — keep these two
// in sync if either changes.
const STORAGE_KEY = "theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeClass(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts at "system"/"light" to match the server-rendered markup (no
  // access to localStorage during SSR); the effect below reconciles with
  // whatever the inline no-flash script already applied to <html>, so there
  // is no visible flash even though this state starts "wrong" for a split
  // second before hydration.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private browsing, etc.) — fall back to system.
    }
    const initial: Theme = stored === "light" || stored === "dark" ? stored : "system";
    setThemeState(initial);
    setResolvedTheme(initial === "system" ? getSystemTheme() : initial);
  }, []);

  useEffect(() => {
    const resolved = theme === "system" ? getSystemTheme() : theme;
    setResolvedTheme(resolved);
    applyThemeClass(resolved);
  }, [theme]);

  // Follow the OS-level preference live while set to "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      applyThemeClass(resolved);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore write failures — theme just won't persist across reloads.
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
