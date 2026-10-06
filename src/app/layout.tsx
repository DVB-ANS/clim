import type { Metadata } from "next";
import { Doto, Inter, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import { BackScroll } from "@/components/BackScroll";
import { MotionProvider } from "@/components/MotionProvider";
import { WalletProviders } from "@/components/WalletProviders";
import "./globals.css";

// Ventriloc's pairing: a neo-grotesque for headings (PolySans, substituted by Inter Tight) over Inter.
// Doto is the dot-matrix face of the CL-1 instrument's screen.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const doto = Doto({ subsets: ["latin"], variable: "--font-doto", display: "swap" });

export const metadata: Metadata = {
  title: { default: "clim: storm insurance for Uniswap v4 LPs", template: "%s · clim" },
  description: "A Chainlink CRE risk desk publishes ETH volatility on-chain; a Uniswap v4 hook turns it into the LP fee on every swap.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // In-page anchors glide (globals.css); a route change jumps to the top instead (Next 16 opt-in).
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} ${interTight.variable} ${doto.variable}`}>
      <body className="min-h-screen">
        <WalletProviders>
          <MotionProvider>{children}</MotionProvider>
          <BackScroll />
        </WalletProviders>
      </body>
    </html>
  );
}
