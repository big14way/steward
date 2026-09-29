import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Chrome from "./chrome";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://steward-arc.vercel.app"),
  title: "STEWARD — let your AI agent pay people, within limits it can’t cross",
  description: "Per-contractor budgets enforced on-chain, every payment decision logged and replayable, and a one-tap approval when a request is over policy. USDC on Arc, Circle wallets.",
  openGraph: { title: "STEWARD", description: "On-chain budgets, a replayable decision log and human escalation for AI agents that pay people on Arc.", images: ["/shots/dashboard.jpg"] },
  twitter: { card: "summary_large_image", images: ["/shots/dashboard.jpg"] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased" style={{ fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif" }}>
        <Providers>
          <Chrome />
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
          <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-xs text-zinc-600">
            Arc Testnet · chain 5042002 · USDC · contracts + docs at <a className="underline" href="https://github.com/big14way/steward" target="_blank">github.com/big14way/steward</a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
