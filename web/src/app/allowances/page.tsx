"use client";
import { useEffect, useState } from "react";
import { get, post, usd, addr, short, when, type Allowance } from "@/lib/api";

const periodLabel = (s: number) => (s === 0 ? "no reset" : s === 86400 ? "daily" : s === 604800 ? "weekly" : `${s}s`);

export default function Page() {
  const [list, setList] = useState<Allowance[]>([]);
  const [f, setF] = useState({ owner_secret: "", payee: "", cap_period: "800", per_tx: "200", period: "604800", expiry: "0", fund: "500", payer_name: "" });
  const [out, setOut] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = () => get<Allowance[]>("/allowances").then(setList).catch(() => setList([]));
  useEffect(() => { load(); try { setF((x) => ({ ...x, owner_secret: localStorage.getItem("steward.owner_secret") ?? "" })); } catch {} }, []);
  const submit = async () => {
    setBusy(true);
    try { localStorage.setItem("steward.owner_secret", f.owner_secret); } catch {}
    const r = await post("/allowances", { ...f, cap_period: Math.round(+f.cap_period * 1e6), per_tx: Math.round(+f.per_tx * 1e6), period: +f.period, expiry: +f.expiry, fund: Math.round(+f.fund * 1e6) });
    setOut(r.data); setBusy(false); load();
  };
  const act = async (id: number, kind: "fund" | "revoke") => {
    const amount = kind === "fund" ? Math.round(+(prompt("Fund how much USDC?", "100") ?? "0") * 1e6) : 0;
    if (kind === "fund" && !amount) return;
    if (kind === "revoke" && !confirm(`Revoke allowance #${id}? Unspent USDC is refunded to the owner and the agent is locked out.`)) return;
    setBusy(true);
    const r = await post(`/allowances/${id}/${kind}`, { owner_secret: f.owner_secret, amount });
    setOut(r.data); setBusy(false); load();
  };
  const F = (k: keyof typeof f, label: string) => (
    <label className="block text-sm"><span className="text-zinc-400">{label}</span>
      <input className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <div className="grid md:grid-cols-[1fr_1.4fr] gap-8">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Create an allowance</h1>
        <p className="text-sm text-zinc-400">The owner wallet calls <code>create()</code> then <code>fund()</code>. The agent can only ever pay this payee, within these caps.</p>
        {F("owner_secret", "Owner secret")}{F("payer_name", "Business name")}{F("payee", "Contractor address (Arc)")}
        {F("cap_period", "Cap per period (USDC)")}{F("per_tx", "Cap per payment (USDC)")}{F("period", "Period (seconds; 604800 = week, 86400 = day, 0 = never resets)")}
        {F("expiry", "Expiry unix (0 = none)")}{F("fund", "Fund now (USDC)")}
        <button disabled={busy || !f.owner_secret || !f.payee} onClick={submit} className="bg-zinc-100 text-zinc-900 disabled:opacity-50 rounded px-4 py-2">{busy ? "…" : "Create allowance"}</button>
        {out != null && <pre className="text-xs bg-zinc-900 p-3 rounded overflow-auto">{JSON.stringify(out, null, 2)}</pre>}
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-medium">On-chain allowances</h2>
        {list.length === 0 && <div className="text-zinc-500 text-sm">None yet.</div>}
        {list.map((a) => (
          <div key={a.id} className={`rounded border p-3 text-sm space-y-1 ${a.revoked ? "border-red-900/60 opacity-70" : "border-zinc-800"}`}>
            <div className="flex flex-wrap gap-x-3">
              <span className="font-mono">#{a.id}</span>
              <span>payee <a className="underline" href={addr(a.payee)} target="_blank">{short(a.payee)}</a></span>
              <span className="text-zinc-400">owner {short(a.owner)}</span>
              {a.revoked && <span className="text-red-300">revoked</span>}
              {a.expiry > 0 && <span className="text-zinc-500">expires {when(a.expiry)}</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div><div className="text-zinc-500">funded</div><div className="text-base">{usd(a.funded)}</div></div>
              <div><div className="text-zinc-500">spent / cap ({periodLabel(a.period)})</div><div className="text-base">{usd(a.spentThisPeriod)} / {usd(a.capPerPeriod)}</div></div>
              <div><div className="text-zinc-500">per-payment cap</div><div className="text-base">{usd(a.perTxCap)}</div></div>
              <div><div className="text-zinc-500">period started</div><div>{when(a.periodStart)}</div></div>
            </div>
            {!a.revoked && (
              <div className="flex gap-2 pt-1">
                <button disabled={busy || !f.owner_secret} onClick={() => act(a.id, "fund")} className="bg-zinc-800 disabled:opacity-50 rounded px-2 py-1 text-xs">Fund</button>
                <button disabled={busy || !f.owner_secret} onClick={() => act(a.id, "revoke")} className="bg-red-900/60 disabled:opacity-50 rounded px-2 py-1 text-xs">Revoke</button>
                <a className="text-xs underline text-zinc-400 self-center" href={`/decisions?allowance=${a.id}`}>decisions →</a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
