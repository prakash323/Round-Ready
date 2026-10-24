import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * The single source of truth for the theme.
 *
 * Three stored states, not two: "system" is distinct from an explicit light or
 * dark choice, so a student who has never touched the toggle follows their OS
 * — and keeps following it when the OS flips at sunset. Picking a theme
 * explicitly opts out of that until they choose "system" again.
 *
 * The class is applied by `applyTheme`, which the boot script in index.html
 * also runs before first paint. Keeping both on the same two lines of logic is
 * what stops the page flashing the wrong theme on load.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "roundready:theme";

function systemTheme(): ResolvedTheme {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStored(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Private mode, or storage blocked. Fall through to the system default.
  }
  return "system";
}

function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  // Native controls — scrollbars, date pickers, form widgets — follow this
  // rather than the class, so it has to be set explicitly.
  root.style.colorScheme = resolved;
}

interface ThemeState {
  /** What the student chose, including "system". */
  choice: ThemeChoice;
  /** What that actually resolves to right now. */
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
  /** Flip between light and dark, leaving "system" behind. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStored());
  const [system, setSystem] = useState<ResolvedTheme>(() => systemTheme());

  // Follow the OS while the choice is "system".
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme = choice === "system" ? system : choice;

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisting is a degraded experience, not a broken one.
    }
  }, []);

  const toggle = useCallback(() => {
    setChoiceState((current) => {
      const next: ThemeChoice =
        (current === "system" ? systemTheme() : current) === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ choice, resolved, setChoice, toggle }),
    [choice, resolved, setChoice, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
