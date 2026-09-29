"use client";
import { useCallback, useEffect, useState } from "react";
import { Inbox, ArrowUpRight, ShieldAlert, Check, X } from "lucide-react";
import { get, post, usd, tx, ago, ruleText, JUDGE_SECRET, type Decision, type Contractor, type Milestone } from "@/lib/api";
import { useOwnerSecret } from "../owner-chip";
import { Avatar, Button, Card, EmptyState, PageHeader, Pill, Skeleton, useToast } from "../ui";

type Item = Decision & { milestone?: Milestone };

export default function Page() {
  const owner = useOwnerSecret();
  const secret = owner || JUDGE_SECRET;
  const toast = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState("");
  const [names, setNames] = useState<Record<number, Contractor>>({});

  const load = useCallback(async () => {
    const es = await get<Decision[]>("/escalations").catch(() => [] as Decision[]);
    const withMs = await Promise.all(es.map(async (e) => ({ ...e, milestone: await get<Milestone[]>(`/milestones?allowance_id=${e.allowance_id}&limit=50`).then((l) => l.find((m) => m.id === e.milestone_id)).catch(() => undefined) })));
    setItems(withMs);
    if (owner) get<Contractor[]>("/contractors", { "X-Owner-Secret": owner }).then((l) => setNames(Object.fromEntries(l.map((c) => [c.allowance_id, c])))).catch(() => {});
  }, [owner]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const act = async (x: Item, kind: "approve" | "reject") => {
    setBusy(x.hash);
    const r = await post<{ txHash?: string; detail?: string }>(`/escalations/${x.hash}/${kind}`, { owner_secret: secret });
    setBusy("");
    if (r.ok) toast.push("ok", kind === "approve" ? <>Paid {usd(x.remainder)} USDC from the owner wallet. <a className="underline" href={tx(r.data.txHash)} target="_blank">View transaction</a></> : "Declined.");
    else toast.push("err", r.data.detail ?? `Failed (${r.status})`);
    load();
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Approvals" description="Requests the agent would not pay on its own. Approving pays from your Circle wallet in one transaction — it bypasses the agent's caps but never the funding, the kill switch, or the one-hash-pays-once rule." />
      {!secret && <Card className="p-3 mb-4 text-sm text-amber-200 border-amber-500/30 bg-amber-500/5">Sign in as the owner (top right) to approve or decline.</Card>}
      {items === null && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40" />)}</div>}
      {items && items.length === 0 && <EmptyState icon={Inbox} title="Nothing waiting for you" body="The agent pays in-policy requests by itself. Over-policy requests and screening failures show up here." />}
      <div className="space-y-3">
        {items?.map((x) => {
          const c = names[x.allowance_id];
          const blocked = x.action === "SCREEN_FAIL";
          const who = c?.name ?? `Budget #${x.allowance_id}`;
          return (
            <Card key={x.hash} className={`p-4 ${blocked ? "border-red-500/40" : "border-amber-500/40"}`}>
              <div className="flex items-start gap-3">
                <Avatar name={who} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <div className="font-medium">{x.milestone?.title ?? "Payment request"}</div>
                    <div className="text-sm text-zinc-400">{who}</div>
                    <div className="ml-auto text-xs text-zinc-500">{ago(x.created_at)}</div>
                  </div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{usd(x.remainder)} <span className="text-base text-zinc-500 font-normal">USDC</span>{x.amount > 0 && <span className="text-sm text-zinc-500 font-normal"> · {usd(x.amount)} already paid</span>}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Pill tone={blocked ? "red" : "amber"}>{blocked ? <><ShieldAlert className="h-3 w-3 mr-1" />Blocked</> : ruleText(x.rule)}</Pill>
                    {x.milestone?.evidence_url && <a className="inline-flex items-center gap-0.5 text-zinc-300 underline" href={x.milestone.evidence_url} target="_blank">evidence<ArrowUpRight className="h-3.5 w-3.5" /></a>}
                  </div>
                  <div className="mt-2 text-sm text-zinc-400">{x.reason}</div>
                  {!blocked ? (
                    <div className="mt-3 flex gap-2">
                      <Button variant="success" disabled={!secret || busy === x.hash} onClick={() => act(x, "approve")}><Check className="h-4 w-4" />{busy === x.hash ? "Paying… (~20 s)" : `Approve & pay ${usd(x.remainder)}`}</Button>
                      <Button variant="secondary" disabled={!secret || busy === x.hash} onClick={() => act(x, "reject")}><X className="h-4 w-4" />Decline</Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-red-300">
                      <span>The payee is on the denylist. Even a forced transfer would be rejected by the chain.</span>
                      <Button size="sm" variant="secondary" disabled={!secret || busy === x.hash} onClick={() => act(x, "reject")}>Dismiss</Button>
                    </div>
                  )}
                  <div className="mt-3 text-[11px] text-zinc-600 font-mono break-all">decision {x.hash}{x.escalate_tx && <> · <a className="underline" href={tx(x.escalate_tx)} target="_blank">escalated on-chain</a></>}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
