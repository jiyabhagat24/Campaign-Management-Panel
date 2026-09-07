import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import DevFeedback from "@/components/DevFeedback";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Campaign Management Panel — TheBoredMonkey",
  description: "One panel for the full influencer campaign lifecycle.",
};

// No-flash-of-wrong-theme script, inlined directly here rather than through
// next-themes (see src/lib/theme-context.tsx for why). This has to live in
// the Server Component root layout, not inside a "use client" component:
// rendered here it's plain static HTML emitted once by the server and never
// touched again, so it just runs and exits before hydration — the same
// script rendered from inside a client component instead gets re-evaluated
// by React on every client-side re-render of that component, which is what
// trips React 19/Next 16's "Encountered a script tag while rendering React
// component" warning. Reads the same "theme" localStorage key
// src/lib/theme-context.tsx's ThemeProvider reads/writes.
const noFlashThemeScript = `(function(){try{var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=t==='dark'||((!t||t==='system')&&m);if(dark)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plusJakartaSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashThemeScript }} />
      </head>
      <body className="font-sans antialiased selection:bg-indigo-500 selection:text-white">
        <Providers>{children}</Providers>
        <DevFeedback />
      </body>
    </html>
  );
}

