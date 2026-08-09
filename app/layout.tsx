import type { Metadata, Viewport } from "next";
import { PAPER, PAPER_DARK } from "@/lib/palette";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baby Baby",
  description: "Feeding, sleep and diapers — logged in a couple of taps.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Baby Baby",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // stops iOS double-tap zoom during fast repeated taps
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PAPER },
    { media: "(prefers-color-scheme: dark)", color: PAPER_DARK },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
