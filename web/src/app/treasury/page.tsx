"use client";
import { useCallback, useEffect, useState } from "react";
import { get, post, usd, tx, addr, short, when, ACTION_TEXT, type Treasury } from "@/lib/api";
import { useOwnerSecret } from "../owner-chip";

export default function Page() {
  const secret = useOwnerSecret();
  const [t, setT] = useState<Treasury | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => get<Treasury>("/treasury").then(setT).catch(() => setT({ events: [] })), []);
  useEffect(() => { load(); const i = setInterval(load, 20000); return () => clearInterval(i); }, [load]);
  const topUp = async () => {
    const v = prompt("Move how many USDC from the owner wallet into the reserve?", "5"); if (!v) return;
    setBusy(true); const r = await post<{ txHash?: string; detail?: string }>("/treasury/fund", { owner_secret: secret, amount: Math.round(+v * 1e6) }); setBusy(false);
    setMsg(r.ok ? `Moved ${v} USDC into the reserve.` : (r.data.detail ?? "Failed")); load();
  };
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Treasury</h1>
      <p className="text-sm text-zinc-400">
        Between pay cycles the agent parks idle reserve USDC in a yield vault and pulls it back before obligations come due. A floor always stays liquid.
        On testnet the vault is <code>MockUSYC</code> (an ERC-4626 stand-in) until USYC access is allowlisted.
      </p>
      {!t?.sweeper && t && <div className="text-zinc-500 text-sm">No treasury configured.</div>}
      {t?.sweeper && (
        <div className="grid grid-cols-3 gap-3">
          {[["Liquid reserve", usd(t.balance ?? 0)], ["In vault (earning)", usd(t.position_assets ?? 0)], ["Floor kept liquid", usd(t.floor ?? 0)]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-zinc-800 p-4"><div className="text-xs text-zinc-400">{k}</div><div className="text-2xl font-semibold mt-1">{v} <span className="text-sm text-zinc-500">USDC</span></div></div>
          ))}
        </div>
      )}
      {t?.sweeper && <div className="text-xs text-zinc-500">reserve <a className="underline" href={addr(t.sweeper)} target="_blank">{short(t.sweeper)}</a> · vault {t.vault && <a className="underline" href={addr(t.vault)} target="_blank">{short(t.vault)}</a>}</div>}
      {secret && <button disabled={busy} onClick={topUp} className="rounded bg-zinc-100 text-zinc-900 disabled:opacity-50 px-4 py-2 text-sm">Move USDC into the reserve</button>}
      {msg && <div className="text-sm text-zinc-300">{msg}</div>}
      <h2 className="text-lg font-medium pt-2">Moves</h2>
      {t?.events.length === 0 && <div className="text-zinc-500 text-sm">No sweeps or redemptions yet.</div>}
      {t?.events.map((e) => (
        <div key={e.id} className="rounded-lg border border-zinc-800 p-3 text-sm flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-sky-300">{ACTION_TEXT[e.action] ?? e.action}</span>
          <span className="font-medium">{usd(e.assets)} USDC</span>
          <span className="text-zinc-500">{e.shares} shares</span>
          <span className="ml-auto text-zinc-500">{when(e.created_at)}</span>
          <a className="underline text-zinc-400" href={tx(e.tx)} target="_blank">tx ↗</a>
          {e.record_tx && <a className="underline text-zinc-400" href={tx(e.record_tx)} target="_blank">audit ↗</a>}
        </div>
      ))}
    </div>
  );
}
