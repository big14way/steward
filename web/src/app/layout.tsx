import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import Providers from "./providers";
import OwnerChip from "./owner-chip";

export const metadata: Metadata = {
  title: "STEWARD — let your agent pay people, within limits you set",
  description: "Per-contractor budgets enforced on-chain, every payment decision logged and replayable, and a one-tap approval when a request is over policy. USDC on Arc.",
};

const nav = [
  ["/", "Overview"], ["/contractors", "Contractors"], ["/approvals", "Approvals"], ["/activity", "Activity"], ["/treasury", "Treasury"], ["/sdk", "SDK"],
] as const;

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        <Providers>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 sm:px-6 py-3 border-b border-zinc-800 text-sm">
            <Link href="/" className="font-semibold tracking-tight text-base">STEWARD</Link>
            {nav.slice(1).map(([href, label]) => (
              <Link key={href} href={href} className="text-zinc-300 hover:text-white">{label}</Link>
            ))}
            <OwnerChip />
          </nav>
          {process.env.NEXT_PUBLIC_JUDGE_MODE === "true" && (
            <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-sm px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Judge mode: you are the owner of <b>Acme Studio</b>. Nothing to install — every signature happens server-side in Circle wallets.</span>
              <Link href="/approvals" className="rounded bg-amber-400 text-zinc-900 font-medium px-3 py-1">Open approvals →</Link>
              {process.env.NEXT_PUBLIC_JUDGE_SECRET && <span className="text-xs text-amber-200/80">judge secret <code>{process.env.NEXT_PUBLIC_JUDGE_SECRET}</code> (approve / reject only)</span>}
            </div>
          )}
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
          <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-xs text-zinc-600">
            Arc Testnet · chain 5042002 · USDC · contracts + docs at <a className="underline" href="https://github.com/big14way/steward" target="_blank">github.com/big14way/steward</a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
