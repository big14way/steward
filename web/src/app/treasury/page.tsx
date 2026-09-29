"use client";
import { useCallback, useEffect, useState } from "react";
import { Landmark, ArrowUpRight, PiggyBank } from "lucide-react";
import { get, post, usd, tx, addr, short, when, ACTION_TEXT, type Treasury } from "@/lib/api";
import { useOwnerSecret } from "../owner-chip";
import { Button, Card, EmptyState, PageHeader, Pill, Skeleton, Stat, inputCls, useToast } from "../ui";

export default function Page() {
  const secret = useOwnerSecret();
  const toast = useToast();
  const [t, setT] = useState<Treasury | null>(null);
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get<Treasury>("/treasury").then(setT).catch(() => setT({ events: [] })), []);
  useEffect(() => { load(); const i = setInterval(load, 20000); return () => clearInterval(i); }, [load]);
  const topUp = async () => {
    setBusy(true); const r = await post<{ txHash?: string; detail?: string }>("/treasury/fund", { owner_secret: secret, amount: Math.round(+amt * 1e6) }); setBusy(false);
    r.ok ? toast.push("ok", <>Moved {amt} USDC into the reserve. <a className="underline" href={tx(r.data.txHash)} target="_blank">tx</a></>) : toast.push("err", r.data.detail ?? "Failed"); setAmt(""); load();
  };
  return (
    <div className="max-w-3xl">
      <PageHeader title="Treasury" description={<>Between pay cycles the agent parks idle reserve USDC in a yield vault and pulls it back before obligations come due. A floor always stays liquid. On testnet the vault is <code>MockUSYC</code> (an ERC-4626 stand-in) until USYC access is allowlisted.</>} />
      {t === null && <div className="grid grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {t && !t.sweeper && <EmptyState icon={Landmark} title="No treasury configured" body="Set YIELD_SWEEPER on the API to enable sweeps." />}
      {t?.sweeper && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={<Landmark className="h-3.5 w-3.5" />} label="Liquid reserve" value={<>{usd(t.balance ?? 0)} <span className="text-sm text-zinc-500">USDC</span></>} />
            <Stat icon={<PiggyBank className="h-3.5 w-3.5" />} label="In vault (earning)" value={<>{usd(t.position_assets ?? 0)} <span className="text-sm text-zinc-500">USDC</span></>} />
            <Stat label="Floor kept liquid" value={<>{usd(t.floor ?? 0)} <span className="text-sm text-zinc-500">USDC</span></>} />
          </div>
          <div className="mt-2 text-xs text-zinc-500">reserve <a className="underline" href={addr(t.sweeper)} target="_blank">{short(t.sweeper)}</a> · vault {t.vault && <a className="underline" href={addr(t.vault)} target="_blank">{short(t.vault)}</a>}</div>
          {secret && (
            <Card className="mt-4 p-4 flex flex-wrap items-center gap-2">
              <div className="text-sm text-zinc-300 mr-2">Move USDC from your wallet into the reserve</div>
              <input type="number" className={`${inputCls} w-32`} placeholder="5" value={amt} onChange={(e) => setAmt(e.target.value)} />
              <Button disabled={busy || !(+amt > 0)} onClick={topUp}>{busy ? "Sending…" : "Move"}</Button>
            </Card>
          )}
          <h2 className="text-lg font-medium mt-8 mb-3">Moves</h2>
          <Card className="divide-y divide-zinc-800">
            {t.events.length === 0 && <div className="p-6 text-zinc-500 text-sm">No sweeps or redemptions yet.</div>}
            {t.events.map((e) => (
              <div key={e.id} className="px-4 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
                <Pill tone="sky">{ACTION_TEXT[e.action] ?? e.action}</Pill>
                <span className="font-medium tabular-nums">{usd(e.assets)} USDC</span>
                <span className="text-zinc-500">{e.shares} shares</span>
                <span className="ml-auto text-zinc-500">{when(e.created_at)}</span>
                <a className="text-zinc-400 hover:text-white inline-flex items-center gap-0.5" href={tx(e.tx)} target="_blank">tx<ArrowUpRight className="h-3.5 w-3.5" /></a>
                {e.record_tx && <a className="text-zinc-400 hover:text-white inline-flex items-center gap-0.5" href={tx(e.record_tx)} target="_blank">audit<ArrowUpRight className="h-3.5 w-3.5" /></a>}
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
