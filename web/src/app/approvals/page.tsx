"use client";
import { useCallback, useEffect, useState } from "react";
import { get, post, usd, tx, ago, ruleText, JUDGE_SECRET, type Decision, type Contractor, type Milestone } from "@/lib/api";
import { useOwnerSecret } from "../owner-chip";

type Item = Decision & { milestone?: Milestone; contractor?: Contractor };

export default function Page() {
  const owner = useOwnerSecret();
  const secret = owner || JUDGE_SECRET;
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [names, setNames] = useState<Record<number, Contractor>>({});

  const load = useCallback(async () => {
    const es = await get<Decision[]>("/escalations").catch(() => [] as Decision[]);
    const withMs = await Promise.all(es.map(async (e) => ({ ...e, milestone: await get<Milestone[]>(`/milestones?allowance_id=${e.allowance_id}&limit=50`).then((l) => l.find((m) => m.id === e.milestone_id)).catch(() => undefined) })));
    setItems(withMs);
    if (owner) get<Contractor[]>("/contractors", { "X-Owner-Secret": owner }).then((l) => setNames(Object.fromEntries(l.map((c) => [c.allowance_id, c])))).catch(() => {});
  }, [owner]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const act = async (h: string, kind: "approve" | "reject") => {
    setBusy(h); setMsg(null);
    const r = await post<{ txHash?: string; detail?: string; chain?: string }>(`/escalations/${h}/${kind}`, { owner_secret: secret });
    setBusy("");
    setMsg(r.ok ? { ok: true, text: kind === "approve" ? "Approved and paid from the owner wallet." : "Declined.", tx: r.data.txHash } : { ok: false, text: r.data.detail ?? `Failed (${r.status})` });
    load();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Approvals</h1>
      <p className="text-sm text-zinc-400">
        Requests the agent would not pay on its own. Approving pays from your Circle wallet in one transaction — it bypasses the agent's caps but never
        the funding, the kill switch, or the one-hash-pays-once rule. Screening failures cannot be approved.
      </p>
      {!secret && <div className="text-amber-300 text-sm">Sign in as the owner (top right) to approve or decline.</div>}
      {msg && (
        <div className={`text-sm rounded border p-3 ${msg.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-red-500/40 bg-red-500/10 text-red-200"}`}>
          {msg.text}{msg.tx && <> <a className="underline" href={tx(msg.tx)} target="_blank">view transaction ↗</a></>}
        </div>
      )}
      {items.length === 0 && <div className="rounded-lg border border-zinc-800 p-6 text-zinc-400 text-sm">Nothing waiting for you. The agent pays in-policy requests by itself.</div>}
      {items.map((x) => {
        const c = names[x.allowance_id];
        const blocked = x.action === "SCREEN_FAIL";
        return (
          <div key={x.hash} className={`rounded-lg border p-4 space-y-2 ${blocked ? "border-red-500/40" : "border-amber-500/40"}`}>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <div className="font-medium text-base">{x.milestone?.title ?? "Payment request"}</div>
              <div className="text-zinc-400 text-sm">{c ? c.name : `budget #${x.allowance_id}`}</div>
              <div className="ml-auto text-zinc-500 text-xs">{ago(x.created_at)}</div>
            </div>
            <div className="text-2xl font-semibold">{usd(x.remainder)} USDC{x.amount > 0 && <span className="text-sm text-zinc-500 font-normal"> · {usd(x.amount)} already paid</span>}</div>
            <div className="text-sm"><span className={blocked ? "text-red-300" : "text-amber-300"}>{ruleText(x.rule)}</span>{x.milestone?.evidence_url && <> · <a className="underline text-zinc-300" href={x.milestone.evidence_url} target="_blank">evidence ↗</a></>}</div>
            <div className="text-sm text-zinc-400">{x.reason}</div>
            {!blocked ? (
              <div className="flex gap-2 pt-1">
                <button disabled={!secret || busy === x.hash} onClick={() => act(x.hash, "approve")} className="rounded bg-emerald-600 disabled:opacity-50 px-4 py-2 text-sm font-medium">{busy === x.hash ? "Paying… (~20 s)" : `Approve & pay ${usd(x.remainder)}`}</button>
                <button disabled={!secret || busy === x.hash} onClick={() => act(x.hash, "reject")} className="rounded bg-zinc-800 disabled:opacity-50 px-4 py-2 text-sm">Decline</button>
              </div>
            ) : (
              <div className="text-red-300 text-xs flex flex-wrap items-center gap-3">
                <span>Blocked. The payee is on the denylist; the chain would reject this transfer even if forced.</span>
                <button disabled={!secret || busy === x.hash} onClick={() => act(x.hash, "reject")} className="rounded bg-zinc-800 disabled:opacity-50 px-2 py-1">Dismiss</button>
              </div>
            )}
            <div className="text-[11px] text-zinc-600 font-mono break-all">decision {x.hash}{x.escalate_tx && <> · <a className="underline" href={tx(x.escalate_tx)} target="_blank">escalated on-chain</a></>}</div>
          </div>
        );
      })}
    </div>
  );
}
