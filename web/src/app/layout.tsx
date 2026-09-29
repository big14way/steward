import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Chrome from "./chrome";

export const metadata: Metadata = {
  title: "STEWARD — let your agent pay people, within limits you set",
  description: "Per-contractor budgets enforced on-chain, every payment decision logged and replayable, and a one-tap approval when a request is over policy. USDC on Arc.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
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
