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

const DESCRIPTION = "A Chainlink CRE risk desk publishes ETH volatility on-chain; a Uniswap v4 hook turns it into the LP fee on every swap.";
const SHARE_TITLE = "clim° · storm insurance for Uniswap v4 LPs";
// the link preview (Telegram, X, Builderbase): the deck's cover at 1200 x 630 (public/og.png)
const SHARE_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "clim°, storm insurance for Uniswap v4 LPs, built on Chainlink and Uniswap" };

export const metadata: Metadata = {
  metadataBase: new URL("https://clim-zeta.vercel.app"),
  title: { default: "clim: storm insurance for Uniswap v4 LPs", template: "%s · clim" },
  description: DESCRIPTION,
  openGraph: { title: SHARE_TITLE, description: DESCRIPTION, url: "/", siteName: "clim", type: "website", locale: "en_US", images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", title: SHARE_TITLE, description: DESCRIPTION, images: [SHARE_IMAGE] },
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
