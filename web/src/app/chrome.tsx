"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Inbox, ScrollText, Landmark, Code2, ShieldCheck, ExternalLink, FlaskConical } from "lucide-react";
import OwnerChip, { useOwnerSecret } from "./owner-chip";
import { isDemoSecret, DEMO_ENABLED } from "@/lib/api";

const nav = [
  ["/dashboard", "Overview", LayoutDashboard], ["/contractors", "Contractors", Users], ["/approvals", "Approvals", Inbox],
  ["/activity", "Activity", ScrollText], ["/treasury", "Treasury", Landmark], ["/sdk", "SDK", Code2],
] as const;

/** Site chrome. Landing (/) gets a marketing nav; app routes get the app nav; contractor pages (/c/…) a minimal header.
 *  There is no banner. A demo session (started from /demo) is shown as a small mode pill, the way sandbox/test modes are. */
export default function Chrome() {
  const path = usePathname() ?? "/";
  const owner = useOwnerSecret();
  const demo = isDemoSecret(owner);

  if (path.startsWith("/c/")) {
    return (
      <header className="px-4 sm:px-6 py-3 border-b border-zinc-800 text-sm flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <span className="font-semibold tracking-tight">STEWARD</span>
        <span className="text-zinc-500">· contractor page</span>
      </header>
    );
  }
  if (path === "/" || path === "/demo") {
    return (
      <nav className="sticky top-0 z-30 bg-zinc-950/80 backdrop-blur border-b border-zinc-800/60">
        <div className="max-w-6xl mx-auto flex items-center gap-4 px-4 sm:px-6 py-3 text-sm">
          <Link href="/" className="flex items-center gap-1.5 font-semibold tracking-tight text-base"><ShieldCheck className="h-5 w-5 text-emerald-400" />STEWARD</Link>
          <Link href="/sdk" className="text-zinc-400 hover:text-white hidden sm:inline">SDK</Link>
          <a href="https://github.com/big14way/steward" target="_blank" className="text-zinc-400 hover:text-white hidden sm:inline-flex items-center gap-1"><ExternalLink className="h-4 w-4" />GitHub</a>
          {DEMO_ENABLED && <Link href="/demo" className="ml-auto text-zinc-300 hover:text-white">Try the demo</Link>}
          <Link href="/dashboard" className={`${DEMO_ENABLED ? "" : "ml-auto "}inline-flex items-center rounded-md bg-emerald-500 text-zinc-950 px-3 py-1.5 font-medium hover:bg-emerald-400`}>Open the dashboard</Link>
        </div>
      </nav>
    );
  }
  return (
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
        {demo && (
          <span className="ml-auto mr-1 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-200 px-2.5 py-1 text-xs whitespace-nowrap" title="You are exploring as the owner of Acme Studio. Approve and decline only.">
            <FlaskConical className="h-3.5 w-3.5" />Demo session
          </span>
        )}
        <OwnerChip />
      </div>
    </nav>
  );
}
