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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plusJakartaSans.variable} suppressHydrationWarning>
      <body className="font-sans antialiased selection:bg-indigo-500 selection:text-white">
        <Providers>{children}</Providers>
        <DevFeedback />
      </body>
    </html>
  );
}

