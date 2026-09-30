"use client";
import { useCallback, useEffect, useState } from "react";
import { Inbox, ArrowUpRight, ShieldAlert, Check, X, Send } from "lucide-react";
import Link from "next/link";
import { get, post, usd, tx, ago, short, ruleText, BASE_SEPOLIA_EXPLORER, type Decision, type Contractor, type Milestone, type Account } from "@/lib/api";
import { useSession } from "../session";
import { Avatar, Button, EmptyState, PageHeader, Pill, Skeleton, TxLink, useToast, Card, Modal } from "../ui";
import CopyButton from "../copy-button";

type Item = Decision & { milestone?: Milestone };

export default function Page() {
  const { me } = useSession();
  const secret = me ? "session" : "";
  const toast = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState("");
  const [names, setNames] = useState<Record<number, Contractor>>({});
  const [tg, setTg] = useState<Account["telegram"] | null>(null);
  useEffect(() => { if (me) get<Account>("/account").then((a) => setTg(a.telegram ?? null)).catch(() => {}); }, [me]);
  const [tgLink, setTgLink] = useState<{ url: string; bot: string; code: string } | null>(null);
  const connectTelegram = async () => {
    const r = await post<{ url?: string; bot?: string; code?: string; detail?: string }>("/telegram/link-code", {});
    if (r.ok && r.data.url && r.data.code) setTgLink({ url: r.data.url, bot: r.data.bot ?? "", code: r.data.code });
    else toast.push("err", r.data.detail ?? "Could not start the Telegram link.");
  };
  useEffect(() => {   // once connected, close the dialog and show the pill
    if (!tgLink) return;
    const t = setInterval(() => get<Account>("/account").then((a) => { if (a.telegram?.connected) { setTg(a.telegram); setTgLink(null); toast.push("ok", "Telegram connected. Approval requests will arrive there."); } }).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [tgLink, toast]);

  const load = useCallback(async () => {
    const es = await get<Decision[]>("/escalations").catch(() => [] as Decision[]);
    const withMs = await Promise.all(es.map(async (e) => ({ ...e, milestone: await get<Milestone[]>(`/milestones?allowance_id=${e.allowance_id}&limit=50`).then((l) => l.find((m) => m.id === e.milestone_id)).catch(() => undefined) })));
    setItems(withMs);
    if (me) get<Contractor[]>("/contractors").then((l) => setNames(Object.fromEntries(l.map((c) => [c.allowance_id, c])))).catch(() => {});
  }, [me]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const act = async (x: Item, kind: "approve" | "reject") => {
    setBusy(x.hash);
    const r = await post<{ txHash?: string; mint_tx?: string; chain?: string; detail?: string }>(`/escalations/${x.hash}/${kind}`, {});
    setBusy("");
    if (r.ok) toast.push("ok", kind !== "approve" ? "Declined." : r.data.mint_tx ? <>Paid {usd(x.remainder)} USDC on Base Sepolia via CCTP. <a className="underline" href={tx(r.data.txHash)} target="_blank">Burn on Arc Testnet</a> · <a className="underline" href={`${BASE_SEPOLIA_EXPLORER}/tx/${r.data.mint_tx}`} target="_blank">Mint on Base Sepolia</a></> : <>Paid {usd(x.remainder)} USDC from the owner wallet. <a className="underline" href={tx(r.data.txHash)} target="_blank">View on Arc Testnet</a></>);
    else toast.push("err", r.data.detail ?? `Failed (${r.status})`);
    load();
  };

  return (
    <div className="max-w-3xl">
      <Modal open={!!tgLink} onClose={() => setTgLink(null)} title="Get approvals on Telegram">
        {tgLink && (
          <ol className="space-y-4 text-sm">
            <li><div className="font-medium">1 · Open the bot</div>
              <a href={tgLink.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-500 text-zinc-950 px-3 py-1.5 font-medium hover:bg-emerald-400"><Send className="h-4 w-4" />Open @{tgLink.bot}</a>
              <p className="mt-1 text-xs text-zinc-500">Press Start. If it connects, this window closes by itself.</p></li>
            <li><div className="font-medium">2 · If it only says hello, send it this message</div>
              <div className="mt-2 flex items-center gap-2"><code className="rounded bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono">/connect {tgLink.code}</code><CopyButton text={`/connect ${tgLink.code}`} /></div>
              <p className="mt-1 text-xs text-zinc-500">The code works once and expires in 30 minutes.</p></li>
          </ol>
        )}
      </Modal>
      <PageHeader title="Approvals" description="Requests the agent would not pay on its own. Approving pays from your Circle wallet in one transaction — it bypasses the agent's caps but never the funding, the kill switch, or the one-hash-pays-once rule."
        action={tg?.available && me?.role === "owner" ? (tg.connected
          ? <Pill tone="emerald"><Send className="h-3 w-3 mr-1" />Telegram connected</Pill>
          : <Button variant="secondary" onClick={connectTelegram}><Send className="h-4 w-4" />Get approvals on Telegram</Button>) : undefined} />
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
                      <Button variant="success" disabled={!secret || busy === x.hash} onClick={() => act(x, "approve")}><Check className="h-4 w-4" />{busy === x.hash ? "Paying… (~20 s)" : `Approve & pay ${usd(x.remainder)}${x.rule.endsWith("_xchain") ? " on Base Sepolia" : ""}`}</Button>
                      <Button variant="secondary" disabled={!secret || busy === x.hash} onClick={() => act(x, "reject")}><X className="h-4 w-4" />Decline</Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-red-300">
                      <span>The payee is on the denylist. Even a forced transfer would be rejected by the chain.</span>
                      <Button size="sm" variant="secondary" disabled={!secret || busy === x.hash} onClick={() => act(x, "reject")}>Dismiss</Button>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500"><span>Recorded on-chain</span><TxLink hash={x.record_tx} /><span>Escalated</span><TxLink hash={x.escalate_tx} /><span className="font-mono text-zinc-600 break-all">decision {short(x.hash, 8)}</span></div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
