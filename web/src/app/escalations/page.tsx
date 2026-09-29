"use client";
import { useEffect, useState } from "react";
import { get, post, usd, tx, when, ACTION_COLOR, type Decision } from "@/lib/api";

export default function Page() {
  const [items, setItems] = useState<Decision[]>([]);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<string>("");
  const load = () => get<Decision[]>("/escalations").then(setItems).catch(() => setItems([]));
  useEffect(() => {
    load();
    try { setSecret(localStorage.getItem("steward.owner_secret") || process.env.NEXT_PUBLIC_JUDGE_SECRET || ""); } catch { setSecret(process.env.NEXT_PUBLIC_JUDGE_SECRET ?? ""); }
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  const act = async (h: string, kind: "approve" | "reject") => {
    setBusy(h); setMsg("");
    try { localStorage.setItem("steward.owner_secret", secret); } catch {}
    const r = await post<{ txHash?: string; detail?: string }>(`/escalations/${h}/${kind}`, { owner_secret: secret });
    setMsg(r.ok ? (r.data.txHash ? `${kind}d — tx ${r.data.txHash}` : `${kind}ed`) : `${r.status}: ${r.data.detail ?? "failed"}`);
    setBusy("");
    load();
  };
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Escalations</h1>
      <p className="text-sm text-zinc-400 max-w-3xl">
        Requests the rules would not pay. Approving calls <code>approveAndPay()</code> from the owner wallet — it bypasses the agent's caps but not
        funding or revocation, and the decision hash still pays exactly once. Screening failures cannot be approved.
      </p>
      <input className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 w-full" placeholder="owner secret (judge: see banner / README)"
        value={secret} onChange={(e) => setSecret(e.target.value)} />
      {msg && <div className="text-sm text-zinc-300 break-all">{msg.includes("tx 0x") ? <>{msg.split(" tx ")[0]} tx <a className="underline" href={tx(msg.split(" tx ")[1])} target="_blank">{msg.split(" tx ")[1]}</a></> : msg}</div>}
      {items.length === 0 && <div className="text-zinc-400">No pending escalations.</div>}
      {items.map((x) => (
        <div key={x.hash} className="rounded border border-amber-500/30 p-4 space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className={`font-mono ${ACTION_COLOR[x.action] ?? ""}`}>{x.action}</span>
            <span>{usd(x.remainder)} USDC requested{x.amount > 0 && <span className="text-zinc-500"> ({usd(x.amount)} already paid)</span>}</span>
            <span className="text-zinc-400">allowance #{x.allowance_id} · {x.rule}</span>
            <span className="text-zinc-500 ml-auto">{when(x.created_at)}</span>
          </div>
          <div className="text-sm">{x.reason}</div>
          <div className="text-xs font-mono text-zinc-500 break-all">{x.hash}</div>
          {x.action !== "SCREEN_FAIL" ? (
            <div className="flex gap-2">
              <button disabled={busy === x.hash || !secret} onClick={() => act(x.hash, "approve")} className="bg-emerald-600 disabled:opacity-50 rounded px-3 py-1 text-sm">Approve & pay {usd(x.remainder)}</button>
              <button disabled={busy === x.hash || !secret} onClick={() => act(x.hash, "reject")} className="bg-zinc-700 disabled:opacity-50 rounded px-3 py-1 text-sm">Reject</button>
            </div>
          ) : (
            <div className="text-red-300 text-xs">Screening failed — cannot be approved. The contract would revert on a blocklisted payee anyway.
              <button disabled={busy === x.hash || !secret} onClick={() => act(x.hash, "reject")} className="ml-3 bg-zinc-700 disabled:opacity-50 rounded px-2 py-0.5 text-xs">Dismiss</button></div>
          )}
        </div>
      ))}
    </div>
  );
}
