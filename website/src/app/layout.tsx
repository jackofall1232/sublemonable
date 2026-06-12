// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jetbrains",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sublemonable.com"),
  title: "Sublemonable — Nothing lasts. That's the point.",
  description:
    "End-to-end encrypted messaging that disappears. No logs. No screenshots. No trace. Open source, zero-knowledge, no phone number required.",
  openGraph: {
    title: "Sublemonable — Nothing lasts. That's the point.",
    description:
      "End-to-end encrypted messaging that disappears. No logs. No screenshots. No trace.",
    url: "https://sublemonable.com",
    siteName: "Sublemonable",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Clash Display via Fontshare — no trackers, just fonts. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="preload"
          as="style"
          href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&display=swap"
        />
      </head>
      <body className="bg-bg-primary font-body text-ink-primary antialiased">
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
