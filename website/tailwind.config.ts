import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Monochrome UI. All the color on this page comes from the category
        // palette in `lib/categories.ts`, which mirrors the app's own — so the
        // only thing that reads as colored is the data itself.
        canvas: "#F7F7F5",
        surface: "#FFFFFF",
        ink: "#0F172A",
        "ink-2": "#475569",
        "ink-3": "#8A8A82",
        line: "#E7E5E1",
      },
      fontFamily: {
        sans: ["'Instrument Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tighter: "-0.035em",
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "draw-line": {
          from: { "stroke-dashoffset": "var(--dash)" },
          to: { "stroke-dashoffset": "0" },
        },
        "grow-bar": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        "draw-line": "draw-line 1.1s cubic-bezier(0.22, 1, 0.36, 1) both",
        "grow-bar": "grow-bar 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.6s ease both",
      },
    },
  },
  plugins: [],
} satisfies Config;
