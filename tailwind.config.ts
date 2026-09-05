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
          50: "#F3F1FA", // Pale lavender — page background
          100: "#EDE9F9", // Soft lavender tint — subtle card/badge bg
          200: "#DCD6EF", // Lavender border — card borders
          300: "#C7BFE0",
          400: "#9C93B8", // Lavender-grey — secondary/meta text
          500: "#8478A3",
          600: "#5B4E93", // Muted violet — stage/status label text
          700: "#453A72",
          800: "#2E2557",
          900: "#211A3E", // Deep Indigo — header bar, primary text
          950: "#150F29",
        },
        indigo: {
          50: "#F3F0FC",
          100: "#EEEAF8", // Soft lavender tint
          200: "#DDD3F2",
          300: "#C4B4EA",
          400: "#AD9AE4",
          500: "#9A8AE2",
          600: "#8A7CE0", // Violet accent — logo mark, primary CTAs/links
          700: "#6F62B8",
          800: "#564C8F",
          900: "#3D3665",
          950: "#211A3E",
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
        ink: "#211A3E",
        panel: "#F3F1FA",
        brand: {
          DEFAULT: "#8A7CE0",
          50: "#F3F0FC",
          100: "#EEEAF8",
          500: "#9A8AE2",
          600: "#8A7CE0",
          700: "#6F62B8",
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

