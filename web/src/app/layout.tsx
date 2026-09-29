import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "STEWARD — allowances, decision log, escalation for agents on Arc",
  description: "On-chain per-payee allowances, a replayable decision log, and one-tap human escalation for AI agents that pay people in USDC on Arc.",
};

const nav = [
  ["/", "Overview"], ["/allowances", "Allowances"], ["/decisions", "Decisions"],
  ["/escalations", "Escalations"], ["/contractor", "Contractor"], ["/sdk", "SDK"],
] as const;

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        <Providers>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 border-b border-zinc-800 text-sm">
            <Link href="/" className="font-semibold tracking-tight">STEWARD</Link>
            {nav.slice(1).map(([href, label]) => (
              <Link key={href} href={href} className="text-zinc-300 hover:text-white">{label}</Link>
            ))}
            <span className="ml-auto text-xs text-zinc-500">Arc Testnet · 5042002</span>
          </nav>
          {process.env.NEXT_PUBLIC_JUDGE_MODE === "true" && (
            <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-sm px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Judge mode: you are the owner of <b>Acme Studio</b>. Allowance #0 is funded with test USDC. Signing happens server-side via Circle wallets — nothing to install.</span>
              <Link href="/escalations" className="rounded bg-amber-400 text-zinc-900 font-medium px-3 py-1">Approve a pending escalation →</Link>
              {process.env.NEXT_PUBLIC_JUDGE_SECRET && <span className="text-xs text-amber-200/80">judge secret: <code>{process.env.NEXT_PUBLIC_JUDGE_SECRET}</code> (approve / reject only)</span>}
            </div>
          )}
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
