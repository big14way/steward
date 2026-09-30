"use client";
import { useCallback, useEffect, useState } from "react";
import { Landmark, PiggyBank, TrendingUp } from "lucide-react";
import { get, post, usd, tx, addr, short, when, ACTION_TEXT, type Treasury } from "@/lib/api";
import { useSession } from "../session";
import { Button, Card, EmptyState, PageHeader, Pill, Skeleton, Stat, TxLink, inputCls, useToast } from "../ui";

export default function Page() {
  const { me } = useSession();
  const secret = me?.role === "owner" ? "session" : "";
  const toast = useToast();
  const [t, setT] = useState<Treasury | null>(null);
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [uAmt, setUAmt] = useState("");
  const [uBusy, setUBusy] = useState<"" | "in" | "out">("");
  const usycIn = async () => {
    setUBusy("in"); const r = await post<{ txHash?: string; detail?: string }>("/treasury/usyc/deposit", { amount: Math.round(+uAmt * 1e6) }); setUBusy("");
    r.ok ? toast.push("ok", <>Moved {uAmt} USDC into USYC. <a className="underline" href={tx(r.data.txHash)} target="_blank">View on Arc Testnet</a></>) : toast.push("err", r.data.detail ?? "Failed"); setUAmt(""); load();
  };
  const usycOut = async () => {
    setUBusy("out"); const r = await post<{ txHash?: string; usdc_received?: number; detail?: string }>("/treasury/usyc/redeem", { all: true }); setUBusy("");
    r.ok ? toast.push("ok", <>Redeemed USYC for {usd(r.data.usdc_received ?? 0)} USDC. <a className="underline" href={tx(r.data.txHash)} target="_blank">View on Arc Testnet</a></>) : toast.push("err", r.data.detail ?? "Failed"); load();
  };
  const load = useCallback(() => get<Treasury>("/treasury").then(setT).catch(() => setT({ events: [] })), []);
  useEffect(() => { load(); const i = setInterval(load, 20000); return () => clearInterval(i); }, [load]);
  const topUp = async () => {
    setBusy(true); const r = await post<{ txHash?: string; detail?: string }>("/treasury/fund", { amount: Math.round(+amt * 1e6) }); setBusy(false);
    r.ok ? toast.push("ok", <>Moved {amt} USDC into the reserve. <a className="underline" href={tx(r.data.txHash)} target="_blank">tx</a></>) : toast.push("err", r.data.detail ?? "Failed"); setAmt(""); load();
  };
  return (
    <div className="max-w-3xl">
      <PageHeader title="Treasury" description="Money that isn't needed yet earns yield until a budget needs it. The owner's idle USDC sits in USYC, Circle's tokenized money-market fund, and the agent's reserve keeps a floor liquid for upcoming payments." />
      {t?.usyc && (
        <Card className="p-5 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-emerald-400" /><span className="font-medium">USYC</span>
            <Pill tone={t.usyc.allowlisted ? "emerald" : "amber"}>{t.usyc.allowlisted ? "Allowlisted by Circle" : "Not allowlisted"}</Pill>
            <span className="text-xs text-zinc-500">held by your Circle wallet, minted and redeemed through Circle's Teller on Arc</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Held" value={<>{(t.usyc.shares / 1e6).toFixed(4)} <span className="text-sm text-zinc-500">USYC</span></>} />
            <Stat label="Worth now" value={<>{usd(t.usyc.value)} <span className="text-sm text-zinc-500">USDC</span></>} />
            <Stat label="Price" value={<>{(t.usyc.price / 1e6).toFixed(4)} <span className="text-sm text-zinc-500">USDC per USYC</span></>} />
          </div>
          {t.usyc.price_ok === false && <p className="mt-3 text-xs text-amber-300">USYC's testnet price feed reads {(t.usyc.price / 1e6).toFixed(2)} USDC per USYC, far from its normal ~1.1, so the value above is not meaningful. Moving money in or out is paused until the price is back in range.</p>}
          {secret && t.usyc.allowlisted && t.usyc.price_ok !== false && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input type="number" className={`${inputCls} w-32`} placeholder="5" value={uAmt} onChange={(e) => setUAmt(e.target.value)} />
              <Button disabled={!!uBusy || !(+uAmt > 0)} onClick={usycIn}>{uBusy === "in" ? "Moving… (~20 s)" : "Move USDC into USYC"}</Button>
              <Button variant="secondary" disabled={!!uBusy || !t.usyc.shares} onClick={usycOut}>{uBusy === "out" ? "Redeeming…" : "Redeem all to USDC"}</Button>
            </div>
          )}
        </Card>
      )}
      {t === null && <div className="grid grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {t && !t.sweeper && <EmptyState icon={Landmark} title="Your yield reserve isn't set up yet" body={t.usyc && !t.usyc.allowlisted ? "USYC is permissioned: Circle allowlists wallets on request. Open a ticket with Circle Support that includes your owner wallet address (Overview page), and this page lets you move idle USDC into USYC once it's approved." : "Idle USDC can earn in USYC from this page."} />}
      {t?.sweeper && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={<Landmark className="h-3.5 w-3.5" />} label="Liquid reserve" value={<>{usd(t.balance ?? 0)} <span className="text-sm text-zinc-500">USDC</span></>} />
            <Stat icon={<PiggyBank className="h-3.5 w-3.5" />} label="In vault (earning)" value={<>{usd(t.position_assets ?? 0)} <span className="text-sm text-zinc-500">USDC</span></>} />
            <Stat label="Floor kept liquid" value={<>{usd(t.floor ?? 0)} <span className="text-sm text-zinc-500">USDC</span></>} />
          </div>
          <div className="mt-2 text-xs text-zinc-500">Agent reserve <a className="underline" href={addr(t.sweeper)} target="_blank">{short(t.sweeper)}</a> · its vault {t.vault && <a className="underline" href={addr(t.vault)} target="_blank">{short(t.vault)}</a>} is an ERC-4626 stand-in (MockUSYC); the reserve contract's vault is fixed at deploy, so it moves to USYC at the next redeploy.</div>
          {secret && (
            <Card className="mt-4 p-4 flex flex-wrap items-center gap-2">
              <div className="text-sm text-zinc-300 mr-2">Move USDC from your wallet into the reserve</div>
              <input type="number" className={`${inputCls} w-32`} placeholder="5" value={amt} onChange={(e) => setAmt(e.target.value)} />
              <Button disabled={busy || !(+amt > 0)} onClick={topUp}>{busy ? "Sending…" : "Move"}</Button>
            </Card>
          )}
          <h2 className="text-lg font-medium mt-8 mb-3">Moves</h2>
          <Card className="divide-y divide-zinc-800">
            {t.events.length === 0 && <div className="p-6 text-zinc-500 text-sm">Nothing moved yet.</div>}
            {t.events.map((e) => (
              <div key={e.id} className="px-4 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
                <Pill tone={e.action.startsWith("USYC") ? "emerald" : "sky"}>{ACTION_TEXT[e.action] ?? e.action}</Pill>
                <span className="font-medium tabular-nums">{usd(e.assets)} USDC</span>
                <span className="text-zinc-500">{e.action.startsWith("USYC") ? `${(e.shares / 1e6).toFixed(4)} USYC` : `${e.shares} shares`}</span>
                <span className="ml-auto text-zinc-500 text-xs">{when(e.created_at)}</span>
                <TxLink hash={e.tx} />
                {e.record_tx && <TxLink hash={e.record_tx} label="audit" />}
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
