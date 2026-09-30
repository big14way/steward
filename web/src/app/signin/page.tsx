"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, FlaskConical, LogIn, Link2 } from "lucide-react";
import { PUBLIC_API, DEMO_ENABLED } from "@/lib/api";
import { useSession } from "../session";
import { Button, Card, Field, inputCls } from "../ui";

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const { me, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"" | "login" | "demo">("");
  const [err, setErr] = useState(params.get("expired") ? "Your session ended. Sign in again." : "");

  // A stale cookie is cleared server-side; a live session skips this page.
  useEffect(() => {
    if (params.get("expired")) fetch(`${PUBLIC_API}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    else if (me) router.replace(next);
  }, [me, next, params, router]);

  const go = async (kind: "login" | "demo") => {
    setBusy(kind); setErr("");
    const r = await fetch(`${PUBLIC_API}/auth/${kind}`, {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: kind === "login" ? JSON.stringify({ email, password }) : "{}",
    }).catch(() => null);
    if (!r || !r.ok) {
      const d = r ? await r.json().catch(() => ({})) : {};
      setErr(d.detail ?? "Could not reach STEWARD. Try again.");
      setBusy("");
      return;
    }
    await refresh();
    router.replace(kind === "demo" ? "/approvals" : next);
  };

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-2">
          <div className="mx-auto h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 grid place-items-center"><ShieldCheck className="h-6 w-6 text-emerald-400" /></div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to STEWARD</h1>
          <p className="text-sm text-zinc-400">For the business that pays contractors.</p>
        </div>
        <Card className="p-5">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); go("login"); }}>
            <Field label="Work email"><input className={inputCls} type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password"><input className={inputCls} type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {err && <p className="text-sm text-red-300" role="alert">{err}</p>}
            <Button type="submit" className="w-full justify-center" disabled={!!busy || !email || !password}><LogIn className="h-4 w-4" />{busy === "login" ? "Signing in…" : "Sign in"}</Button>
          </form>
          {DEMO_ENABLED && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-zinc-500"><div className="h-px flex-1 bg-zinc-800" />or<div className="h-px flex-1 bg-zinc-800" /></div>
              <Button variant="secondary" className="w-full justify-center" disabled={!!busy} onClick={() => go("demo")}><FlaskConical className="h-4 w-4" />{busy === "demo" ? "Opening the demo…" : "Explore the live demo"}</Button>
              <p className="mt-2 text-xs text-zinc-500 text-center">The demo can view, approve and decline real testnet requests. It can’t add or fund budgets.</p>
            </>
          )}
        </Card>
        <p className="text-xs text-zinc-500 flex gap-2"><Link2 className="h-4 w-4 shrink-0 text-zinc-600" />Getting paid by a STEWARD customer? You don’t need an account. Open the private link they sent you.</p>
        <p className="text-center text-sm text-zinc-400">New to STEWARD? <Link className="underline hover:text-white" href="/signup">Create a workspace</Link></p>
        <p className="text-center text-xs text-zinc-600"><Link className="underline hover:text-zinc-400" href="/">Back to the home page</Link></p>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><SignIn /></Suspense>;
}
