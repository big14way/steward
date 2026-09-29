"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { get, post, usd, addr, short, when, periodLabel, type Contractor } from "@/lib/api";
import { useOwnerSecret } from "../owner-chip";

const PERIODS: [string, number][] = [["per week", 604800], ["per day", 86400], ["per month", 2592000], ["never resets", 0]];

export default function Page() {
  const secret = useOwnerSecret();
  const [list, setList] = useState<Contractor[] | null>(null);
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [f, setF] = useState({ name: "", contact: "", address: "", per_tx: "3", cap_period: "8", period: "604800", fund: "6" });
  const [busy, setBusy] = useState("");
  const [created, setCreated] = useState<Contractor | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(() => {
    if (!secret) { setList(null); return; }
    get<Contractor[]>("/contractors", { "X-Owner-Secret": secret }).then((l) => { setList(l); setErr(""); }).catch((e) => { setErr(String(e.message) === "401" ? "That owner secret was not accepted." : "Could not load contractors."); setList([]); });
  }, [secret]);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const copy = async (c: Contractor) => { try { await navigator.clipboard.writeText(c.link); setCopied(c.id); setTimeout(() => setCopied(""), 1500); } catch {} };

  const add = async () => {
    setBusy("add"); setErr("");
    const r = await post<Contractor & { detail?: string }>("/contractors", {
      owner_secret: secret, name: f.name, contact: f.contact, address: f.address,
      per_tx: Math.round(+f.per_tx * 1e6), cap_period: Math.round(+f.cap_period * 1e6), period: +f.period, fund: Math.round(+f.fund * 1e6),
    });
    setBusy("");
    if (!r.ok) { setErr(r.data.detail ?? `Failed (${r.status})`); return; }
    setCreated(r.data); setShowAdd(false); setF({ name: "", contact: "", address: "", per_tx: "3", cap_period: "8", period: "604800", fund: "6" }); load();
  };
  const topUp = async (c: Contractor) => {
    const v = prompt(`Top up ${c.name}'s budget by how many USDC?`, "5"); if (!v) return;
    setBusy(c.id); const r = await post<{ detail?: string }>(`/contractors/${c.id}/fund`, { owner_secret: secret, amount: Math.round(+v * 1e6) }); setBusy("");
    if (!r.ok) setErr(r.data.detail ?? "Top-up failed (is the owner wallet funded?)"); load();
  };
  const revoke = async (c: Contractor) => {
    if (!confirm(`End ${c.name}'s budget? Unspent USDC returns to you and their link stops working.`)) return;
    setBusy(c.id); const r = await post<{ detail?: string }>(`/contractors/${c.id}/revoke`, { owner_secret: secret }); setBusy("");
    if (!r.ok) setErr(r.data.detail ?? "Revoke failed"); load();
  };
  const F = (k: keyof typeof f, label: string, hint?: string, placeholder?: string) => (
    <label className="block text-sm"><span className="text-zinc-300">{label}</span>{hint && <span className="text-zinc-500"> — {hint}</span>}
      <input className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2" placeholder={placeholder} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );

  if (!secret) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-xl font-semibold">Contractors</h1>
        <p className="text-zinc-400 text-sm">Sign in as the owner (top right) to add contractors, share their links, top up budgets, or end an engagement.</p>
        <p className="text-zinc-500 text-sm">Are you a contractor? Use the private link the owner sent you — it opens your own page with your budget and requests.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contractors</h1>
          <p className="text-sm text-zinc-400">Each contractor has an on-chain budget the agent cannot exceed, and a private link to request payment.</p>
        </div>
        <button onClick={() => { setShowAdd(!showAdd); setCreated(null); }} className="ml-auto rounded bg-zinc-100 text-zinc-900 px-4 py-2 text-sm font-medium">{showAdd ? "Close" : "Add contractor"}</button>
      </div>
      {err && <div className="text-red-300 text-sm">{err}</div>}

      {created && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2 text-sm">
          <div className="font-medium text-emerald-200">{created.name} is set up{created.circle_wallet_created ? " — a Circle wallet was created for them" : ""}.</div>
          <div className="text-zinc-300">Send them this private link. It opens their page: budget, request form, status of every request. No wallet or sign-up needed.</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="bg-zinc-900 rounded px-2 py-1 break-all">{created.link}</code>
            <button onClick={() => copy(created)} className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-xs">{copied === created.id ? "Copied" : "Copy link"}</button>
          </div>
          {created.create_tx && <div className="text-xs text-zinc-500">on-chain: <a className="underline" href={`https://explorer.testnet.arc.io/tx/${created.create_tx}`} target="_blank">budget created</a>{created.fund_tx && <> · <a className="underline" href={`https://explorer.testnet.arc.io/tx/${created.fund_tx}`} target="_blank">funded</a></>}</div>}
        </div>
      )}

      {showAdd && (
        <div className="rounded-lg border border-zinc-800 p-4 grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="font-medium">Who</div>
            {F("name", "Name", undefined, "Jane Doe")}
            {F("contact", "Email or handle", "optional", "jane@studio.com")}
            {F("address", "Their wallet address on Arc", "optional — leave blank and STEWARD creates a Circle wallet for them", "0x…")}
          </div>
          <div className="space-y-3">
            <div className="font-medium">Budget the agent can spend on them</div>
            {F("per_tx", "Max per payment (USDC)", "the agent asks you above this")}
            {F("cap_period", "Max per period (USDC)")}
            <label className="block text-sm"><span className="text-zinc-300">Period</span>
              <select className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}>
                {PERIODS.map(([l, v]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            {F("fund", "Fund now (USDC)", "moves from your wallet into the contract; you can top up later")}
            <button disabled={busy === "add" || !f.name.trim()} onClick={add} className="rounded bg-zinc-100 text-zinc-900 disabled:opacity-50 px-4 py-2 text-sm font-medium">{busy === "add" ? "Creating on-chain… (~30 s)" : "Create budget & link"}</button>
          </div>
        </div>
      )}

      {list === null && <div className="text-zinc-500 text-sm">Loading…</div>}
      {list && list.length === 0 && !showAdd && <div className="text-zinc-500 text-sm">No contractors yet. Add one to get a link you can send them.</div>}
      <div className="grid md:grid-cols-2 gap-3">
        {list?.map((c) => {
          const pct = c.policy.cap_period ? Math.min(100, Math.round((c.budget.spent_this_period / c.policy.cap_period) * 100)) : 0;
          return (
            <div key={c.id} className={`rounded-lg border p-4 space-y-3 ${c.status === "revoked" ? "border-red-900/60 opacity-70" : "border-zinc-800"}`}>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <div className="font-medium text-base">{c.name}</div>
                {c.contact && <div className="text-zinc-400 text-sm">{c.contact}</div>}
                <span className={`ml-auto text-xs rounded-full border px-2 py-0.5 ${c.status === "revoked" ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}`}>{c.status}</span>
              </div>
              <div className="text-xs text-zinc-500">pays to <a className="underline" href={addr(c.address)} target="_blank">{short(c.address)}</a>{c.has_circle_wallet ? " (Circle wallet)" : ""} · budget #{c.allowance_id}</div>
              <div className="text-sm text-zinc-300">Up to <b>{usd(c.policy.per_tx)}</b> per payment · <b>{usd(c.policy.cap_period)}</b> {periodLabel(c.policy.period)}{c.policy.expiry ? ` · until ${when(c.policy.expiry)}` : ""}</div>
              <div>
                <div className="flex justify-between text-xs text-zinc-500"><span>spent this period</span><span>{usd(c.budget.spent_this_period)} / {usd(c.policy.cap_period)}</span></div>
                <div className="h-1.5 rounded bg-zinc-800 mt-1"><div className="h-1.5 rounded bg-emerald-500" style={{ width: `${pct}%` }} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-zinc-500">funded</div><div className="text-base">{usd(c.budget.funded)}</div></div>
                <div><div className="text-zinc-500">open requests</div><div className="text-base">{c.requests.open}</div></div>
                <div><div className="text-zinc-500">paid requests</div><div className="text-base">{c.requests.paid}</div></div>
              </div>
              {c.status !== "revoked" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button onClick={() => copy(c)} className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-xs">{copied === c.id ? "Copied" : "Copy their link"}</button>
                  <button disabled={busy === c.id} onClick={() => topUp(c)} className="rounded bg-zinc-800 disabled:opacity-50 px-3 py-1 text-xs">Top up</button>
                  <Link href={`/activity?allowance=${c.allowance_id}`} className="rounded bg-zinc-800 px-3 py-1 text-xs">History</Link>
                  <button disabled={busy === c.id} onClick={() => revoke(c)} className="ml-auto rounded bg-red-900/50 disabled:opacity-50 px-3 py-1 text-xs">End budget</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-xs text-zinc-600">Advanced: contractors who prefer to sign requests with their own wallet can use <Link className="underline" href="/contractor">/contractor</Link> (MetaMask on Arc Testnet).</div>
    </div>
  );
}
