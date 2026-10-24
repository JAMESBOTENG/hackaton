/** @type {import('tailwindcss').Config} */

/*
 * TAO DESIGN SYSTEM — theme direction: "Boardroom Navy".
 *
 * A single, disciplined deep-navy executive-analytics aesthetic in the spirit
 * of a McKinsey / consulting-deck product: calm, authoritative, data-dense but
 * uncluttered. Color is RESTRAINED and used to ENCODE MEANING, never as
 * decoration:
 *   - `ink`      : the near-black navy/slate foundation ramp (surfaces, borders,
 *                  text). This is the canvas everything sits on.
 *   - `brand`    : ONE confident accent (a refined azure/sapphire) used for the
 *                  primary ranked signal, focus rings and key actions.
 *   - `critical` : a red family reserved for can't-miss / emergency risk tier so
 *                  those conditions stay visually distinct and prominent
 *                  (consumed by ProbabilityCard's cantMiss accent in FEAT-003).
 *   - `present`  : a calm green for findings that are ASSERTED / positive.
 *   - `denied`   : a muted rose/red for findings that are NEGATED / ruled out.
 *
 * Elevation is subtle and high-quality (soft, layered shadows on dark surfaces),
 * NOT neon glows. Typography is an intentional system/ui sans stack (no runtime
 * web-font dependency — offline-first), with a crisp numeric type scale.
 *
 * Tokens only live here; FEAT-003 applies them across the components.
 */

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Foundation ramp — deep navy/slate. 950 is the app canvas; lighter
        // steps are raised surfaces, hairline borders and muted-to-bright text.
        ink: {
          50: "#f4f6fb",
          100: "#e6eaf3",
          200: "#c6cfe3",
          300: "#9caacb",
          400: "#6b7ca8",
          500: "#495a85",
          600: "#344368",
          700: "#273452",
          800: "#1b2740",
          850: "#162034",
          900: "#111a2c",
          950: "#0b1220",
        },

        // ONE confident brand accent — refined sapphire/azure. Primary ranked
        // signal, interactive emphasis, focus rings.
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },

        // Can't-miss / critical risk tier — a distinct red family. PRESERVED so
        // emergencies stay prominent (ProbabilityCard forces this for cantMiss).
        critical: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
          950: "#450a0a",
        },

        // Present / asserted findings — calm, confident green (positive signal).
        present: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
        },

        // Denied / negated findings — muted rose (ruled out, lower emphasis than
        // the can't-miss critical red so the two never read as the same thing).
        denied: {
          50: "#fff1f2",
          100: "#ffe4e6",
          200: "#fecdd3",
          300: "#fda4af",
          400: "#fb7185",
          500: "#f43f5e",
          600: "#e11d48",
          700: "#be123c",
          800: "#9f1239",
          900: "#881337",
          950: "#4c0519",
        },

        // Warm amber — probability-magnitude mid-tier / watch emphasis.
        signal: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
        },

        // Semantic aliases mapped onto the ramp so components read intent, not
        // hex. Consumed throughout FEAT-003.
        surface: {
          DEFAULT: "#0b1220", // app canvas (ink-950)
          raised: "#111a2c", // cards / panels (ink-900)
          overlay: "#162034", // modals / popovers (ink-850)
          inset: "#1b2740", // wells / inputs (ink-800)
        },
        hairline: {
          DEFAULT: "#273452", // default border (ink-700)
          strong: "#344368", // emphasized border (ink-600)
          subtle: "#1b2740", // faint divider (ink-800)
        },
        content: {
          DEFAULT: "#e6eaf3", // primary text (ink-100)
          muted: "#9caacb", // secondary text (ink-300)
          subtle: "#6b7ca8", // tertiary / captions (ink-400)
          inverse: "#0b1220", // text on light / accent fills
        },
      },

      fontFamily: {
        // Intentional system/ui sans stack — crisp on every OS, zero network
        // cost (offline-first). No runtime web-font @import.
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
        ],
        // Tabular numerics + labels for the data-dense board.
        mono: [
          '"SF Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          '"Liberation Mono"',
          "monospace",
        ],
      },

      fontSize: {
        // Crisp, consulting-deck type scale with paired line-heights + tracking.
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em" }],
        xs: ["0.75rem", { lineHeight: "1.125rem", letterSpacing: "0.01em" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.6rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.015em" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.02em" }],
        "4xl": ["2.375rem", { lineHeight: "2.6rem", letterSpacing: "-0.025em" }],
        // Oversized tabular figure for the headline probability / confidence.
        stat: ["2.75rem", { lineHeight: "1", letterSpacing: "-0.03em" }],
      },

      letterSpacing: {
        // Uppercase section eyebrows / kicker labels.
        eyebrow: "0.14em",
      },

      borderRadius: {
        sm: "0.3125rem",
        DEFAULT: "0.5rem",
        md: "0.625rem",
        lg: "0.875rem",
        xl: "1.125rem",
        "2xl": "1.5rem",
      },

      borderWidth: {
        hairline: "0.5px",
      },

      boxShadow: {
        // Subtle, layered elevation tuned for dark navy surfaces — depth without
        // neon glow.
        card: "0 1px 2px rgba(3, 7, 18, 0.35), 0 1px 1px rgba(3, 7, 18, 0.25)",
        raised:
          "0 2px 4px rgba(3, 7, 18, 0.4), 0 8px 24px -8px rgba(3, 7, 18, 0.55)",
        overlay:
          "0 8px 24px -4px rgba(3, 7, 18, 0.6), 0 24px 60px -12px rgba(3, 7, 18, 0.7)",
        // Hairline inset to crisp-up panel edges on dark.
        hairline: "inset 0 0 0 1px rgba(255, 255, 255, 0.04)",
        // Accessible focus ring in the brand accent.
        focus: "0 0 0 3px rgba(59, 130, 246, 0.45)",
        // Restrained emphasis ring for a can't-miss row (red, not a glow).
        critical: "0 0 0 1px rgba(239, 68, 68, 0.5)",
      },

      spacing: {
        // A few deliberate rhythm steps for dense board layouts.
        4.5: "1.125rem",
        13: "3.25rem",
        18: "4.5rem",
        22: "5.5rem",
      },

      maxWidth: {
        board: "92rem", // the executive dashboard content width
      },

      transitionTimingFunction: {
        // Calm, confident easing for the FLIP reshuffle + micro-interactions.
        board: "cubic-bezier(0.22, 1, 0.36, 1)",
      },

      keyframes: {
        // Brief highlight when a card's rank/probability changes.
        pulse: {
          "0%": { boxShadow: "0 0 0 0 rgba(59, 130, 246, 0.0)" },
          "30%": { boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.55)" },
          "100%": { boxShadow: "0 0 0 0 rgba(59, 130, 246, 0.0)" },
        },
        // Loading shimmer for the PubMed progressive-enhancement state.
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // Gentle rise-in for newly surfaced findings / cards.
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },

      animation: {
        // Short + purposeful. Never gratuitous.
        // `pulse` (and its explicit alias `pulse-highlight`) are the one-shot
        // card-change highlight consumed in FEAT-003.
        pulse: "pulse 1.1s cubic-bezier(0.22, 1, 0.36, 1) 1",
        "pulse-highlight": "pulse 1.1s cubic-bezier(0.22, 1, 0.36, 1) 1",
        shimmer: "shimmer 1.6s infinite",
        "rise-in": "rise-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
