"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, Building2, Wallet, Link2 } from "lucide-react";
import { PUBLIC_API } from "@/lib/api";
import { useSession } from "../session";
import { Button, Card, Field, inputCls } from "../ui";

/** Self-serve sign-up: a business gets a workspace and its own Circle owner wallet on Arc. */
export default function SignUp() {
  const router = useRouter();
  const { refresh } = useSession();
  const [f, setF] = useState({ name: "", business: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch(`${PUBLIC_API}/auth/signup`, {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(f),
    }).catch(() => null);
    if (!r || !r.ok) {
      const d = r ? await r.json().catch(() => ({})) : {};
      setErr(d.detail ?? "Could not create your workspace. Try again.");
      setBusy(false);
      return;
    }
    await refresh();
    router.replace("/dashboard");
  };

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <div className="mx-auto h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 grid place-items-center"><ShieldCheck className="h-6 w-6 text-emerald-400" /></div>
          <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
          <p className="text-sm text-zinc-400">For a business that pays contractors. Free on Arc Testnet.</p>
        </div>
        <Card className="p-5">
          <form className="space-y-3" onSubmit={submit}>
            <Field label="Business name"><input className={inputCls} placeholder="Lagos Design Co" value={f.business} onChange={set("business")} required /></Field>
            <Field label="Your name"><input className={inputCls} autoComplete="name" placeholder="Amaka Obi" value={f.name} onChange={set("name")} required /></Field>
            <Field label="Work email"><input className={inputCls} type="email" autoComplete="username" placeholder="you@company.com" value={f.email} onChange={set("email")} required /></Field>
            <Field label="Password" hint="at least 10 characters"><input className={inputCls} type="password" autoComplete="new-password" value={f.password} onChange={set("password")} minLength={10} required /></Field>
            {err && <p className="text-sm text-red-300" role="alert">{err}</p>}
            <Button type="submit" className="w-full justify-center" disabled={busy}>{busy ? "Creating your workspace and wallet…" : "Create workspace"}</Button>
          </form>
          <ul className="mt-4 space-y-2 text-xs text-zinc-400">
            <li className="flex gap-2"><Wallet className="h-4 w-4 shrink-0 text-emerald-400" />You get your own Circle wallet on Arc. It signs every budget and approval; there is no key for you to keep.</li>
            <li className="flex gap-2"><Building2 className="h-4 w-4 shrink-0 text-emerald-400" />Your contractors, requests and approvals are private to your workspace.</li>
            <li className="flex gap-2"><Link2 className="h-4 w-4 shrink-0 text-emerald-400" />Contractors never sign up. They use the private link you send them.</li>
          </ul>
        </Card>
        <p className="text-center text-sm text-zinc-400">Already have an account? <Link className="underline hover:text-white" href="/signin">Sign in</Link></p>
      </div>
    </div>
  );
}
