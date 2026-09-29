"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Inbox, ScrollText, Landmark, Code2, ShieldCheck } from "lucide-react";
import OwnerChip from "./owner-chip";

const nav = [
  ["/", "Overview", LayoutDashboard], ["/contractors", "Contractors", Users], ["/approvals", "Approvals", Inbox],
  ["/activity", "Activity", ScrollText], ["/treasury", "Treasury", Landmark], ["/sdk", "SDK", Code2],
] as const;

/** Owner chrome (nav + judge banner). Contractor pages (/c/…) get a minimal header instead. */
export default function Chrome() {
  const path = usePathname() ?? "/";
  if (path.startsWith("/c/")) {
    return (
      <header className="px-4 sm:px-6 py-3 border-b border-zinc-800 text-sm flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <span className="font-semibold tracking-tight">STEWARD</span>
        <span className="text-zinc-500">· contractor page</span>
      </header>
    );
  }
  return (
    <>
      <nav className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-6xl mx-auto flex items-center gap-1 px-2 sm:px-4 py-2 text-sm overflow-x-auto">
          <Link href="/" className="flex items-center gap-1.5 font-semibold tracking-tight text-base px-2 mr-2"><ShieldCheck className="h-5 w-5 text-emerald-400" />STEWARD</Link>
          {nav.map(([href, label, Icon]) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 whitespace-nowrap ${active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"}`}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            );
          })}
          <OwnerChip />
        </div>
      </nav>
      {process.env.NEXT_PUBLIC_JUDGE_MODE === "true" && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Judge mode: you are the owner of <b>Acme Studio</b>. Nothing to install — every signature happens server-side in Circle wallets.</span>
            <Link href="/approvals" className="rounded-md bg-amber-400 text-zinc-900 font-medium px-3 py-1">Open approvals →</Link>
            {process.env.NEXT_PUBLIC_JUDGE_SECRET && <span className="text-xs text-amber-200/80">judge secret <code>{process.env.NEXT_PUBLIC_JUDGE_SECRET}</code> (approve / reject only)</span>}
          </div>
        </div>
      )}
    </>
  );
}
