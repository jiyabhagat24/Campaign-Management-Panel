import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
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
// next-themes (see src/lib/theme-context.tsx for why). A plain <script> tag
// — even rendered straight from this Server Component — still gets flagged
// by Next 16 with "Encountered a script tag while rendering React
// component": Next 16 treats any raw <script>, anywhere in the tree, as a
// component it needs to reconcile, and warns because a plain script element
// doesn't re-execute on client-side re-renders. next/script's
// beforeInteractive strategy is Next's own supported escape hatch for
// exactly this case (a script that must run before hydration to avoid a
// flash of the wrong theme) — it's injected into the initial HTML outside
// normal React reconciliation, so it doesn't hit this warning. Reads the
// same "theme" localStorage key src/lib/theme-context.tsx's ThemeProvider
// reads/writes.
const noFlashThemeScript = `(function(){try{var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=t==='dark'||((!t||t==='system')&&m);if(dark)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plusJakartaSans.variable} suppressHydrationWarning>
      <head>
        <Script id="no-flash-theme" strategy="beforeInteractive">
          {noFlashThemeScript}
        </Script>
      </head>
      <body className="font-sans antialiased selection:bg-indigo-500 selection:text-white">
        <Providers>{children}</Providers>
        <DevFeedback />
      </body>
    </html>
  );
}

