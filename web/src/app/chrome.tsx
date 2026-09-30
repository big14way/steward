"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Inbox, ScrollText, Landmark, Code2, ShieldCheck, ExternalLink } from "lucide-react";
import AccountMenu from "./owner-chip";
import { useSession } from "./session";
import { DEMO_ENABLED } from "@/lib/api";

const nav = [
  ["/dashboard", "Overview", LayoutDashboard], ["/contractors", "Contractors", Users], ["/approvals", "Approvals", Inbox],
  ["/activity", "Activity", ScrollText], ["/treasury", "Treasury", Landmark], ["/sdk", "SDK", Code2],
] as const;

/** Site chrome. Landing (/) gets a marketing nav; app routes get the app nav; contractor pages (/c/…) a minimal header.
 *  Owner pages need a session (email + password, or the limited demo role); the account menu shows which. No banners. */
export default function Chrome() {
  const path = usePathname() ?? "/";
  const { me } = useSession();

  if (path.startsWith("/c/")) {
    return (
      <header className="px-4 sm:px-6 py-3 border-b border-zinc-800 text-sm flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <span className="font-semibold tracking-tight">STEWARD</span>
        <span className="text-zinc-500">· contractor page</span>
      </header>
    );
  }
  if (path === "/signin" || path === "/signup") {
    return (
      <header className="px-4 sm:px-6 py-3 text-sm flex items-center">
        <Link href="/" className="flex items-center gap-1.5 font-semibold tracking-tight text-base"><ShieldCheck className="h-5 w-5 text-emerald-400" />STEWARD</Link>
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
          <span className="ml-auto" />
          {DEMO_ENABLED && !me && <Link href="/demo" className="text-zinc-300 hover:text-white hidden sm:inline">Try the demo</Link>}
          {me
            ? <Link href="/dashboard" className="inline-flex items-center rounded-md bg-emerald-500 text-zinc-950 px-3 py-1.5 font-medium hover:bg-emerald-400">Go to dashboard</Link>
            : <><Link href="/signin" className="text-zinc-300 hover:text-white">Sign in</Link><Link href="/signup" className="inline-flex items-center rounded-md bg-emerald-500 text-zinc-950 px-3 py-1.5 font-medium hover:bg-emerald-400">Get started</Link></>}
        </div>
      </nav>
    );
  }
  return (
    <nav className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
      <div className="max-w-6xl mx-auto flex items-center gap-1 px-2 sm:px-4 py-2 text-sm overflow-x-auto">
        <Link href="/" className="flex items-center gap-1.5 font-semibold tracking-tight text-base px-2 mr-1 sm:mr-2"><ShieldCheck className="h-5 w-5 text-emerald-400" /><span className="hidden sm:inline">STEWARD</span></Link>
        {nav.map(([href, label, Icon]) => {
          const active = path.startsWith(href);
          return (
            <Link key={href} href={href} title={label} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 whitespace-nowrap ${active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"}`}>
              <Icon className="h-4 w-4" /><span className="hidden md:inline">{label}</span>
            </Link>
          );
        })}
        <AccountMenu />
      </div>
    </nav>
  );
}
