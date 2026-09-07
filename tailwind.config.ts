import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "system-ui", "sans-serif"],
      },
      colors: {
        // "Deep Indigo" brand palette. slate/indigo/amber are overridden
        // here (rather than left as Tailwind defaults) because the whole
        // app is already built entirely on top of those scales for
        // neutrals, the primary accent, and the warning/at-risk state —
        // overriding them here recolors the full UI consistently without
        // having to touch every component. emerald (success/onboarded) and
        // rose/blue (danger/info) plus the YouTube/Instagram brand chips
        // are untouched by design.
        slate: {
          // 50-600 are light mode's backgrounds/borders/secondary text — was
          // a pale lavender tint, swapped for a warm off-white/beige (same
          // hue held constant across the ramp the way the old lavender was,
          // just a different hue) so the page reads as beige, not purple.
          50: "#FAF8F3", // Very light warm off-white — page background
          100: "#F5F0E7", // Soft beige tint — subtle card/badge bg
          200: "#E9E1D2", // Beige border — card borders
          300: "#D6C9B0",
          400: "#B3A488", // Warm taupe — secondary/meta text
          500: "#93876C",
          600: "#6E6350", // Muted brown — stage/status label text
          // 700-950 are dark mode's actual surface/border/text colors (cards,
          // the sidebar shell, borders, and — via text-slate-900 — light-mode
          // heading text too). These used to carry the same "Deep Indigo"
          // purple tint as the 50-600 lavender tones above; switched to a
          // true black/near-black neutral ramp so dark mode reads as black,
          // not purple. The violet accent (indigo scale below) is untouched.
          700: "#333333",
          800: "#1F1F1F",
          900: "#141414", // dark mode card/sidebar bg; also light-mode heading text
          950: "#050505", // deepest dark-mode background
        },
        // Was the violet accent ("Deep Indigo" brand). Recolored to gold/
        // yellow, same hue held constant top to bottom the way the old
        // violet ramp did — just swap the hue, not the structure. Every
        // dark-purple-for-text/highlight/CTA spot in the app (sidebar active
        // nav highlight, "Add Campaign" button, links, badges, the logo
        // mark) reads off this scale, so recoloring it here recolors all of
        // them without touching each component.
        indigo: {
          50: "#FDF6E3",
          100: "#FBEEC6", // Soft gold tint
          200: "#F5DD93",
          300: "#EEC85C",
          400: "#E5B233",
          500: "#D9A015",
          600: "#C68E00", // Gold accent — logo mark, primary CTAs/links
          700: "#A6760A",
          800: "#7E5B0C",
          900: "#5C430D",
          950: "#3A2A08",
        },
        // The one warning accent (dusty rose) — replaces amber wherever
        // the app shows a "negotiating"/"at risk" state.
        amber: {
          50: "#F1E4E9",
          100: "#EAD5DC",
          200: "#DEB9C5",
          300: "#CE97A8",
          400: "#BC7690",
          500: "#A8506B", // Dusty rose — at-risk stat bg/text
          600: "#96455E",
          700: "#7C3A4E",
          800: "#63303F",
          900: "#4A2530",
          950: "#2E1620",
        },
        // Same near-black as slate-900 above — ink is the light-mode heading/
        // primary-text color (always paired with dark:text-white), and used
        // to carry the same purple tint.
        ink: "#141414",
        panel: "#FAF8F3", // matches the new slate-50 light-mode page background
        // Mirrors the indigo scale above — same gold accent, referenced
        // directly as bg-brand/text-brand in a handful of components.
        brand: {
          DEFAULT: "#C68E00",
          50: "#FDF6E3",
          100: "#FBEEC6",
          500: "#D9A015",
          600: "#C68E00",
          700: "#A6760A",
        },
        platform: {
          youtube: "#ff0000",
          instagram: "#e1306c",
          shorts: "#ff0000",
        },
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)",
        "card-hover": "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",
      },
    },
  },
  plugins: [],
};
export default config;

