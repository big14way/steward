"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import OwnerChip from "./owner-chip";

const nav = [["/contractors", "Contractors"], ["/approvals", "Approvals"], ["/activity", "Activity"], ["/treasury", "Treasury"], ["/sdk", "SDK"]] as const;

/** Owner chrome (nav + judge banner). Hidden on contractor pages (/c/…), which get a minimal header instead. */
export default function Chrome() {
  const path = usePathname() ?? "/";
  if (path.startsWith("/c/")) {
    return (
      <header className="px-4 sm:px-6 py-3 border-b border-zinc-800 text-sm flex items-center gap-3">
        <span className="font-semibold tracking-tight">STEWARD</span>
        <span className="text-zinc-500">contractor page</span>
      </header>
    );
  }
  return (
    <>
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 sm:px-6 py-3 border-b border-zinc-800 text-sm">
        <Link href="/" className="font-semibold tracking-tight text-base">STEWARD</Link>
        {nav.map(([href, label]) => (
          <Link key={href} href={href} className={`hover:text-white ${path === href ? "text-white" : "text-zinc-300"}`}>{label}</Link>
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
    </>
  );
}
