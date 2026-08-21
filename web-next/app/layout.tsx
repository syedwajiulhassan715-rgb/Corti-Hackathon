import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Fonts are self-hosted, not fetched from a CDN at runtime.
 *
 * This file used to <link> straight to fonts.googleapis.com. On a ward display
 * behind a hospital firewall, or on venue wifi that drops during a five-minute
 * demo, that means the whole interface silently reflows into a system fallback
 * mid-sentence -- different metrics, different rhythm, every carefully set
 * label re-wrapping on stage.
 *
 * next/font downloads both faces at BUILD time and serves them from our own
 * origin, so the typography is as offline-safe as the rest of the demo. Same
 * discipline as caching every Corti response to disk: the network is allowed
 * to be a nice-to-have, never a dependency of the thing being shown.
 *
 * The `variable` names deliberately match the tokens in globals.css, so the
 * type system stays declared in exactly one place.
 */
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ECHO — ward intelligence",
  description:
    "Longitudinal ward intelligence. The nurse's normal work becomes the patient's history.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
