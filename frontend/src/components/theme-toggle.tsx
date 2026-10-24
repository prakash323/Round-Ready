import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme-context";
import type { ThemeChoice } from "../lib/theme-context";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * A three-way segmented control, iOS-style.
 *
 * Three options rather than a two-state switch because "system" is a real
 * preference, not the absence of one — and a plain toggle silently discards
 * it the first time you touch it.
 *
 * Implemented as a radiogroup so arrow keys move between options the way a
 * native segmented control does.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { choice, setChoice } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-0.5 rounded-lg border border-edge bg-canvas p-0.5 ${className}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={label}
            onClick={() => setChoice(value)}
            className={`flex h-7 w-8 items-center justify-center rounded-[0.3rem] transition-colors duration-150 ${
              active
                ? "bg-card text-ink shadow-sm"
                : "text-faint hover:text-muted"
            }`}
          >
            <Icon className="h-[0.9rem] w-[0.9rem]" aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
