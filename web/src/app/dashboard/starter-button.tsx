"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { post, usd } from "@/lib/api";
import { Button, TxLink } from "../ui";

/** One click, once per business: STEWARD's sponsor wallet sends starter test USDC to this workspace's owner wallet. */
export default function StarterButton({ amount, size = "sm" }: { amount: number; size?: "sm" | "md" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState("");
  const [err, setErr] = useState("");

  const claim = async () => {
    setBusy(true); setErr("");
    const r = await post<{ txHash?: string; detail?: string }>("/account/starter-credit", {});
    setBusy(false);
    if (!r.ok || !r.data.txHash) { setErr(r.data.detail ?? `Failed (${r.status})`); return; }
    setTx(r.data.txHash);
    router.refresh();
  };

  if (tx) {
    return <span className="inline-flex flex-wrap items-center gap-2 text-xs text-emerald-300">{usd(amount)} test USDC sent to your wallet.<TxLink hash={tx} /></span>;
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size={size} disabled={busy} onClick={claim}><Gift className="h-3.5 w-3.5" />{busy ? "Sending… (~20 s)" : `Get ${usd(amount)} test USDC`}</Button>
      {err && <span className="text-xs text-red-300" role="alert">{err}</span>}
    </span>
  );
}
