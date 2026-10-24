import type { Config } from "tailwindcss";

/**
 * Every colour resolves to a CSS variable holding raw RGB channels, so the
 * `<alpha-value>` placeholder still composes: `bg-ok/15` keeps working exactly
 * as before, and the same class renders correctly in both themes. That is what
 * let the whole palette become theme-aware without touching the ~40 utility
 * classes already spread across the components.
 *
 * The channel values themselves live in `index.css`, under `:root` for light
 * and `.dark` for dark.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /** Page background. */
        canvas: token("canvas"),
        /** Card and panel surfaces. */
        card: token("card"),
        /** A surface raised above a card — menus, popovers, inputs on cards. */
        raised: token("raised"),
        /** Hairline borders and dividers. */
        edge: token("edge"),
        /** Primary text. */
        ink: token("ink"),
        /** Secondary text. */
        muted: token("muted"),
        /** Tertiary text: captions, hints, metadata. */
        faint: token("faint"),
        /** Semantic states. Never used as the only signal — always with text. */
        ok: token("ok"),
        warn: token("warn"),
        bad: token("bad"),
        info: token("info"),
        /** Primary action. A restrained cyan, used sparingly. */
        accent: token("accent"),
        /** Readable text on top of a filled accent surface. */
        "accent-ink": token("accent-ink"),
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        // One step up from Tailwind's defaults: iOS-ish, consistently applied.
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        // Used sparingly, and defined as variables so the dark theme can drop
        // to almost nothing — shadows read as grime on near-black surfaces.
        card: "var(--shadow-card)",
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      transitionTimingFunction: {
        // Apple's standard ease. Short, decelerating, never bouncy.
        ios: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms cubic-bezier(0.32, 0.72, 0, 1) both",
        "slide-up": "slide-up 220ms cubic-bezier(0.32, 0.72, 0, 1) both",
        "slide-in-left": "slide-in-left 240ms cubic-bezier(0.32, 0.72, 0, 1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
