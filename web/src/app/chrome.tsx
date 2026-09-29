"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Inbox, ScrollText, Landmark, Code2, ShieldCheck, Github, X } from "lucide-react";
import OwnerChip, { useOwnerSecret } from "./owner-chip";

const nav = [
  ["/dashboard", "Overview", LayoutDashboard], ["/contractors", "Contractors", Users], ["/approvals", "Approvals", Inbox],
  ["/activity", "Activity", ScrollText], ["/treasury", "Treasury", Landmark], ["/sdk", "SDK", Code2],
] as const;

/** Site chrome. Landing (/) gets a marketing nav; app routes get the app nav; contractor pages (/c/…) a minimal header.
 *  The judge banner shows only on app routes, only to visitors who are not signed in, and can be dismissed. */
export default function Chrome() {
  const path = usePathname() ?? "/";
  const owner = useOwnerSecret();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => { try { setDismissed(sessionStorage.getItem("steward.judge_dismissed") === "1"); } catch { setDismissed(false); } }, []);
  const dismiss = () => { setDismissed(true); try { sessionStorage.setItem("steward.judge_dismissed", "1"); } catch {} };

  if (path.startsWith("/c/")) {
    return (
      <header className="px-4 sm:px-6 py-3 border-b border-zinc-800 text-sm flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <span className="font-semibold tracking-tight">STEWARD</span>
        <span className="text-zinc-500">· contractor page</span>
      </header>
    );
  }
  if (path === "/") {
    return (
      <nav className="sticky top-0 z-30 bg-zinc-950/80 backdrop-blur border-b border-zinc-800/60">
        <div className="max-w-6xl mx-auto flex items-center gap-4 px-4 sm:px-6 py-3 text-sm">
          <Link href="/" className="flex items-center gap-1.5 font-semibold tracking-tight text-base"><ShieldCheck className="h-5 w-5 text-emerald-400" />STEWARD</Link>
          <Link href="/sdk" className="text-zinc-400 hover:text-white hidden sm:inline">SDK</Link>
          <a href="https://github.com/big14way/steward" target="_blank" className="text-zinc-400 hover:text-white hidden sm:inline-flex items-center gap-1"><Github className="h-4 w-4" />GitHub</a>
          <Link href="/dashboard" className="ml-auto inline-flex items-center rounded-md bg-emerald-500 text-zinc-950 px-3 py-1.5 font-medium hover:bg-emerald-400">Open the dashboard</Link>
        </div>
      </nav>
    );
  }
  const showJudge = process.env.NEXT_PUBLIC_JUDGE_MODE === "true" && !owner && !dismissed;
  return (
    <>
      <nav className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-6xl mx-auto flex items-center gap-1 px-2 sm:px-4 py-2 text-sm overflow-x-auto">
          <Link href="/" className="flex items-center gap-1.5 font-semibold tracking-tight text-base px-2 mr-2"><ShieldCheck className="h-5 w-5 text-emerald-400" />STEWARD</Link>
          {nav.map(([href, label, Icon]) => {
            const active = path.startsWith(href);
            return (
              <Link key={href} href={href} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 whitespace-nowrap ${active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"}`}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            );
          })}
          <OwnerChip />
        </div>
      </nav>
      {showJudge && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Judging? You’re the owner of <b>Acme Studio</b>. Nothing to install — every signature happens server-side in Circle wallets.</span>
            <Link href="/approvals" className="rounded-md bg-amber-400 text-zinc-900 font-medium px-3 py-1">Try an approval →</Link>
            {process.env.NEXT_PUBLIC_JUDGE_SECRET && <span className="text-xs text-amber-200/80">judge secret <code>{process.env.NEXT_PUBLIC_JUDGE_SECRET}</code> (approve / decline only)</span>}
            <button onClick={dismiss} className="ml-auto text-amber-200/70 hover:text-amber-100" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </>
  );
}
