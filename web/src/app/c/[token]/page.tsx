"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowUpRight, Send, FileText } from "lucide-react";
import { get, post, usd, when, ago, periodLabel, ruleText, STATUS_TEXT, type Portal, type Milestone } from "@/lib/api";
import { Avatar, Button, Card, Field, Pill, Skeleton, TxLink, inputCls, useToast } from "../../ui";
import WalletCard from "./wallet-card";

const TONE: Record<string, "emerald" | "amber" | "zinc" | "orange" | "red" | "sky"> = { pending: "zinc", paid: "emerald", partial: "amber", held: "zinc", escalated: "orange", rejected: "red", error: "red", batched: "sky" };

function Timeline({ m }: { m: Milestone }) {
  const d = m.decision;
  const steps: { label: string; detail?: string; at?: number; link?: string; chain?: "arc" | "base-sepolia"; tone: "done" | "wait" | "bad" }[] = [
    { label: "Request submitted", detail: m.auth === "circle" ? "signed by your Circle wallet" : m.auth === "wallet" ? "signed by your wallet" : "via your private link", at: m.created_at, tone: "done" },
  ];
  if (!d) steps.push({ label: "Agent review", detail: "checks screening, evidence, caps and liquidity — usually within a few minutes", tone: "wait" });
  else {
    const rt = ruleText(d.rule); const reason = d.reason ?? "";
    steps.push({ label: "Agent review", detail: reason || rt, at: d.created_at, link: d.record_tx ?? undefined, tone: d.action === "SCREEN_FAIL" ? "bad" : "done" });
    if (d.pay_tx) steps.push({ label: `Paid ${usd(d.amount ?? 0)} USDC`, at: d.created_at, link: d.pay_tx, tone: "done" });
    if ((d.remainder ?? 0) > 0 && d.action !== "SCREEN_FAIL") {
      if (d.approved_tx && d.mint_tx) { steps.push({ label: `Owner approved ${usd(d.remainder ?? 0)} USDC`, detail: "burned on Arc via CCTP", link: d.approved_tx, tone: "done" }); steps.push({ label: `Received ${usd(d.remainder ?? 0)} USDC on Base Sepolia`, link: d.mint_tx, chain: "base-sepolia", tone: "done" }); }
      else if (d.approved_tx) steps.push({ label: `Owner approved ${usd(d.remainder ?? 0)} USDC`, link: d.approved_tx, tone: "done" });
      else if (d.human_agreed === 0) steps.push({ label: "Owner declined", tone: "bad" });
      else steps.push({ label: `Waiting for the owner to approve ${usd(d.remainder ?? 0)} USDC`, detail: "they get a notification; nothing to do on your side", tone: "wait" });
    }
    if (d.action === "HOLD") steps.push({ label: "On hold", detail: "add a link to the work and submit again", tone: "wait" });
    if (d.action === "SCREEN_FAIL") steps.push({ label: "Blocked", detail: "this payee failed screening; contact the owner", tone: "bad" });
  }
  return (
    <ol className="mt-3 space-y-1.5 border-l border-zinc-800 pl-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2 text-xs relative">
          <span className={`absolute -left-[17px] top-1 h-2 w-2 rounded-full ${s.tone === "done" ? "bg-emerald-400" : s.tone === "bad" ? "bg-red-400" : "bg-zinc-500 animate-pulse"}`} />
          <span className="text-zinc-300 min-w-0">{s.label}{s.detail && <span className="text-zinc-500"> — {s.detail}</span>}{s.at ? <span className="text-zinc-600"> · {ago(s.at)}</span> : null}{s.link && <span className="ml-1.5 align-middle inline-block"><TxLink hash={s.link} chain={s.chain ?? "arc"} /></span>}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Page() {
  const { token } = useParams<{ token: string }>();
  const toast = useToast();
  const [p, setP] = useState<Portal | null>(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ title: "", amount: "", evidence_url: "" });
  const [xchain, setXchain] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get<Portal>(`/c/${token}`).then((x) => { setP(x); setErr(""); }).catch((e) => setErr(String(e.message) === "404" ? "This link is not valid. Ask the person paying you for a new one." : "Could not load your page.")), [token]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const submit = async () => {
    setBusy(true);
    const r = await post<{ id?: string; detail?: string }>(`/c/${token}/requests`, { title: f.title, amount: Math.round(+f.amount * 1e6), evidence_url: f.evidence_url, payout_chain: xchain ? "base-sepolia" : "arc" });
    setBusy(false);
    if (!r.ok) { toast.push("err", r.data.detail ?? `Failed (${r.status})`); return; }
    toast.push("ok", "Submitted. The agent reviews within a few minutes; this page updates by itself."); setF({ title: "", amount: "", evidence_url: "" }); load();
  };

  if (err) return <div className="max-w-xl text-zinc-300">{err}</div>;
  if (!p) return <div className="max-w-3xl space-y-4"><Skeleton className="h-16" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  const over = +f.amount > p.policy.per_tx / 1e6;
  const overPeriod = +f.amount > p.budget.remaining_this_period / 1e6;
  const paid = p.requests_list.filter((m) => m.status === "paid" || m.status === "partial").length;
  return (
    <div className="space-y-6 max-w-3xl">
      <section className="flex items-center gap-4">
        <Avatar name={p.payer} size={48} />
        <div className="min-w-0">
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Paid by</div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.payer}</h1>
        </div>
      </section>
      <p className="text-zinc-400 text-sm">Hi {p.name}. This is your private page: request payment for delivered work and track every request. Payments arrive in USDC on Arc{p.has_circle_wallet ? " in the wallet set up for you" : ` at ${p.address.slice(0, 8)}…`}.</p>

      <Card className="p-4 grid grid-cols-3 gap-3">
        <div><div className="text-xs text-zinc-500">max per payment</div><div className="text-xl font-semibold tabular-nums">{usd(p.policy.per_tx)}</div></div>
        <div><div className="text-xs text-zinc-500">left {periodLabel(p.policy.period)}</div><div className="text-xl font-semibold tabular-nums">{usd(p.budget.remaining_this_period)}</div><div className="text-[11px] text-zinc-600">of {usd(p.policy.cap_period)}{p.budget.period_end ? ` · resets ${when(p.budget.period_end)}` : ""}</div></div>
        <div><div className="text-xs text-zinc-500">funded right now</div><div className="text-xl font-semibold tabular-nums">{usd(p.budget.funded)}</div><div className="text-[11px] text-zinc-600">{paid} request{paid === 1 ? "" : "s"} paid so far</div></div>
      </Card>

      {p.status === "revoked" ? (
        <Card className="p-4 text-red-300 text-sm">This engagement has ended; new requests are not accepted.</Card>
      ) : (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 font-medium"><Send className="h-4 w-4 text-emerald-400" />Request a payment</div>
          <Field label="What you delivered"><input className={inputCls} placeholder="Logo v2 — final files" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Link to the work" hint="Drive, Figma, GitHub, invoice PDF…">
            <input className={inputCls} placeholder="https://…" value={f.evidence_url} onChange={(e) => setF({ ...f, evidence_url: e.target.value })} />
            {!f.evidence_url && <div className="text-xs text-zinc-500 mt-1 flex items-center gap-1"><FileText className="h-3 w-3" />Without a link the request goes on hold.</div>}
          </Field>
          <Field label="Amount (USDC)">
            <input className={inputCls} inputMode="decimal" placeholder="150" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            {f.amount && over && <div className="text-xs text-amber-300 mt-1">Above the {usd(p.policy.per_tx)} per-payment cap — the owner will be asked to approve it.</div>}
            {f.amount && !over && overPeriod && <div className="text-xs text-amber-300 mt-1">More than what's left this period — the agent pays what fits and asks the owner for the rest.</div>}
          </Field>
          <label className="flex items-start gap-2 text-xs text-zinc-500 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={xchain} onChange={(e) => setXchain(e.target.checked)} />
            <span>Receive on Base Sepolia instead (via Circle CCTP). The owner executes the transfer after a one-tap approval.</span>
          </label>
          <Button size="lg" disabled={busy || !f.title.trim() || !(+f.amount > 0)} onClick={submit}><Send className="h-4 w-4" />{busy ? "Submitting…" : "Submit request"}</Button>
        </Card>
      )}

      {p.wallet && <WalletCard token={token} w={p.wallet} payer={p.payer} onChange={load} />}

      <section>
        <h2 className="font-medium mb-2">Your requests</h2>
        {p.requests_list.length === 0 && <Card className="p-6 text-zinc-500 text-sm">None yet. Your first request shows up here with its status.</Card>}
        <div className="space-y-2">
          {p.requests_list.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{m.title}</span>
                <span className="tabular-nums">{usd(m.amount)} USDC</span>
                <Pill tone={TONE[m.status] ?? "zinc"}>{STATUS_TEXT[m.status] ?? m.status}</Pill>
                {m.evidence_url && <a className="text-xs underline text-zinc-400 inline-flex items-center gap-0.5" href={m.evidence_url} target="_blank">work<ArrowUpRight className="h-3 w-3" /></a>}
                <span className="ml-auto text-xs text-zinc-500">{when(m.created_at)}</span>
              </div>
              <Timeline m={m} />
            </Card>
          ))}
        </div>
      </section>
      <div className="text-[11px] text-zinc-600">Powered by STEWARD on Arc. Your budget lives in a smart contract the payer cannot overdraw and the agent cannot exceed.</div>
    </div>
  );
}
