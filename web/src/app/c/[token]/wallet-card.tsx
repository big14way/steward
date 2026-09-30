"use client";
import { useState } from "react";
import { Wallet, ArrowUpRight, TrendingUp, Lock } from "lucide-react";
import { post, usd, short, type ContractorWallet } from "@/lib/api";
import { Button, Card, Field, Pill, TxLink, inputCls, useToast } from "../../ui";

const KIND: Record<string, string> = { send: "Sent to your wallet", usyc_mint: "Moved into USYC", usyc_redeem: "Back from USYC" };

/** The contractor's own money: what is in the wallet STEWARD set up for them, sending it to their own wallet, and USYC yield. */
export default function WalletCard({ token, w, payer, onChange }: { token: string; w: ContractorWallet; payer: string; onChange: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState("");
  const [confirm, setConfirm] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "earn" | "redeem">("");
  const avail = w.available / 1e6;
  const amt = amount ? Math.round(+amount * 1e6) : 0;

  const send = async () => {
    setBusy("send");
    const r = await post<{ txHash?: string; amount?: number; to?: string; detail?: string }>(`/c/${token}/withdraw`, { to, confirm, amount: amt });
    setBusy("");
    if (!r.ok) { toast.push("err", r.data.detail ?? `Failed (${r.status})`); return; }
    toast.push("ok", <>Sent {usd(r.data.amount ?? 0)} USDC to {short(r.data.to, 6)}. <a className="underline" href={`https://explorer.testnet.arc.io/tx/${r.data.txHash}`} target="_blank">View on Arc Testnet</a></>);
    setTo(""); setConfirm(""); setAmount(""); onChange();
  };
  const earn = async (redeem: boolean) => {
    setBusy(redeem ? "redeem" : "earn");
    const r = await post<{ txHash?: string; amount?: number; detail?: string }>(`/c/${token}/earn`, redeem ? { redeem_all: true } : { amount: amt });
    setBusy("");
    if (!r.ok) { toast.push("err", r.data.detail ?? `Failed (${r.status})`); return; }
    toast.push("ok", redeem ? <>Your USYC is back as {usd(r.data.amount ?? 0)} USDC.</> : <>Moved {usd(r.data.amount ?? 0)} USDC into USYC.</>);
    setAmount(""); onChange();
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Wallet className="h-4 w-4 text-emerald-400" /><span className="font-medium">Your money</span>
        <span className="text-xs text-zinc-500">in the Circle wallet STEWARD set up for you ({short(w.address, 4)})</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><div className="text-xs text-zinc-500">balance</div><div className="text-xl font-semibold tabular-nums">{usd(w.balance)} <span className="text-sm text-zinc-500 font-normal">USDC</span></div></div>
        <div><div className="text-xs text-zinc-500">you can send</div><div className="text-xl font-semibold tabular-nums">{usd(w.available)}</div><div className="text-[11px] text-zinc-600">{usd(w.fee_reserve)} stays for the network fee</div></div>
        <div><div className="text-xs text-zinc-500">earning in USYC</div><div className="text-xl font-semibold tabular-nums">{w.usyc && w.usyc.price_ok !== false ? usd(w.usyc.value) : "0.00"}</div><div className="text-[11px] text-zinc-600">{w.usyc?.shares ? `${(w.usyc.shares / 1e6).toFixed(4)} USYC` : "nothing yet"}</div></div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
        <div className="text-sm font-medium">Send to my own wallet</div>
        {w.payout_address ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300"><Lock className="h-3.5 w-3.5 text-zinc-500" />Goes to your saved address <code className="text-xs bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">{short(w.payout_address, 6)}</code><span className="text-xs text-zinc-500">only {payer} can reset it</span></div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Your wallet address on Arc"><input className={inputCls} placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} /></Field>
            <Field label="Type it again"><input className={inputCls} placeholder="0x…" value={confirm} onChange={(e) => setConfirm(e.target.value.trim())} /></Field>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Amount (USDC)" hint="leave empty to send everything"><input className={`${inputCls} w-40`} inputMode="decimal" placeholder={avail.toFixed(2)} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Button disabled={!!busy || w.available <= 0 || (!w.payout_address && (!to || !confirm)) || (amount !== "" && !(+amount > 0))} onClick={send}>
            <ArrowUpRight className="h-4 w-4" />{busy === "send" ? "Sending… (~20 s)" : "Send to my wallet"}
          </Button>
        </div>
        {!w.payout_address && <p className="text-xs text-zinc-500">Your first send saves this address. After that your link can only send here, so someone who gets your link can't redirect your money.</p>}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><TrendingUp className="h-4 w-4 text-emerald-400" />Earn yield while you wait
          <Pill tone={w.usyc?.allowlisted ? "emerald" : "zinc"}>{w.usyc?.allowlisted ? "USYC available" : "Needs Circle allowlisting"}</Pill>
        </div>
        {w.usyc?.price_ok === false ? (
          <p className="text-xs text-amber-300">USYC's testnet price feed is out of range right now ({(w.usyc.price / 1e6).toFixed(2)} USDC per USYC instead of about 1.1), so moving money in or out is paused. Your USDC is safe where it is.</p>
        ) : w.usyc?.allowlisted ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!!busy || w.available <= 0} onClick={() => earn(false)}>{busy === "earn" ? "Moving…" : amount ? `Move ${amount} USDC into USYC` : "Move my balance into USYC"}</Button>
            <Button variant="secondary" disabled={!!busy || !w.usyc?.shares} onClick={() => earn(true)}>{busy === "redeem" ? "Redeeming…" : "Bring it back to USDC"}</Button>
          </div>
        ) : (
          <p className="text-xs text-zinc-400">USYC is Circle's tokenized money-market fund, and it's permissioned: Circle allowlists each wallet. Once your wallet is approved, you can park your balance here and bring it back any time.</p>
        )}
      </div>

      {w.moves.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {w.moves.map((m) => (
            <li key={m.tx} className="flex flex-wrap items-center gap-2 text-zinc-400"><span className="text-zinc-200">{KIND[m.kind] ?? m.kind}</span>{usd(m.amount)} USDC<TxLink hash={m.tx} /></li>
          ))}
        </ul>
      )}
    </Card>
  );
}
