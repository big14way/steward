"use client";
import { useState } from "react";
import Link from "next/link";
import { LogOut, FlaskConical, ChevronDown, LogIn } from "lucide-react";
import { useSession } from "./session";
import { Avatar, Button, Modal } from "./ui";

/** Account menu: who is signed in, which workspace, and sign out. The demo role is labelled as such. */
export default function AccountMenu() {
  const { me, loading, signOut } = useSession();
  const [open, setOpen] = useState(false);
  if (loading) return <div className="ml-auto h-8 w-28 rounded-md bg-zinc-900 animate-pulse" />;
  if (!me) {
    return <Link href="/signin" className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"><LogIn className="h-3.5 w-3.5" />Sign in</Link>;
  }
  const demo = me.role === "demo";
  return (
    <div className="ml-auto pl-2 shrink-0 flex items-center gap-2">
      {demo && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-200 px-2.5 py-1 text-xs whitespace-nowrap" title="Approve and decline only.">
          <FlaskConical className="h-3.5 w-3.5" />Demo
        </span>
      )}
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 pl-1 pr-2 py-1 text-sm">
        <Avatar name={me.workspace || me.email} size={24} />
        <span className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-zinc-200 text-xs font-medium">{me.workspace}</span>
          <span className="text-zinc-500 text-[11px] max-w-[160px] truncate">{me.email}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={demo ? "Demo session" : "Your account"}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={me.workspace || me.email} />
            <div>
              <div className="font-medium">{me.workspace}</div>
              <div className="text-sm text-zinc-400">{me.email} · {demo ? "demo (approve and decline only)" : "owner"}</div>
            </div>
          </div>
          <p className="text-sm text-zinc-400">
            {demo
              ? "You are exploring Acme Studio's workspace. Approvals pay real testnet USDC from its Circle wallet. Adding or funding budgets needs the owner."
              : "You can add contractors, fund and end budgets, move reserve funds, and approve requests. Every action is signed by your Circle wallet on Arc."}
          </p>
          <Button variant="secondary" onClick={signOut}><LogOut className="h-4 w-4" />{demo ? "Leave the demo" : "Sign out"}</Button>
        </div>
      </Modal>
    </div>
  );
}
