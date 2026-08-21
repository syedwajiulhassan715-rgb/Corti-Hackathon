import type { Config } from "tailwindcss";

// ECHO's visual identity.
//
// The brief (docs/GOALS.md §19): warm neutral ground, graphite text, subtle
// borders, RESTRAINED green/amber/red, high information density, calm motion.
// Explicitly not: rainbow gradients, glassmorphism, giant hero sections, a
// generic admin dashboard.
//
// WHY THE CLINICAL COLOURS ARE DESATURATED. On a ward display, saturated red
// is the colour of an alarm that has already been ignored a hundred times. The
// levels below are muted on purpose so that the ONE patient who is HIGH reads
// as serious without the board looking like a fire. Colour is never the only
// carrier of state — every level also has a label, because colour-blind
// clinicians exist and because a screenshot in a report loses hue.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm neutral ground, not blue-grey. Reads as paper under ward light.
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        sunk: "var(--sunk)",
        line: "var(--line)",
        ink: "var(--ink)",
        dim: "var(--dim)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        // The ladder. One entry per PriorityLevel in contracts/clinical.ts.
        green: "var(--lvl-green)",
        watch: "var(--lvl-watch)",
        concern: "var(--lvl-concern)",
        high: "var(--lvl-high)",
        critical: "var(--lvl-critical)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Dense by design: a ward board is read at a glance from a metre away,
        // so the scale is tight and the weight does the hierarchy.
        micro: ["10px", { lineHeight: "1.4", letterSpacing: "0.08em" }],
        tiny: ["11.5px", { lineHeight: "1.45" }],
      },
      transitionTimingFunction: {
        // Calm motion. Nothing springs, nothing bounces — this is a clinical
        // instrument, and a playful easing curve would undercut every claim
        // the product makes about restraint.
        calm: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
