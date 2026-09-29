"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { get, post, usd, tx, when, ago, periodLabel, ruleText, STATUS_TEXT, STATUS_COLOR, type Portal, type Milestone } from "@/lib/api";

function Timeline({ m }: { m: Milestone }) {
  const d = m.decision;
  const steps: { label: string; detail?: string; at?: number; link?: string; tone: "done" | "wait" | "bad" }[] = [
    { label: "Request submitted", detail: m.auth === "circle" ? "signed by your Circle wallet" : m.auth === "wallet" ? "signed by your wallet" : "via your private link", at: m.created_at, tone: "done" },
  ];
  if (!d) steps.push({ label: "Agent review", detail: "checks screening, evidence, caps and liquidity — usually within a few minutes", tone: "wait" });
  else {
    steps.push({ label: "Agent review", detail: `${ruleText(d.rule)} — ${d.reason ?? ""}`, at: d.created_at, link: d.record_tx ?? undefined, tone: d.action === "SCREEN_FAIL" ? "bad" : "done" });
    if (d.pay_tx) steps.push({ label: `Paid ${usd(d.amount ?? 0)} USDC`, at: d.created_at, link: d.pay_tx, tone: "done" });
    if ((d.remainder ?? 0) > 0 && d.action !== "SCREEN_FAIL") {
      if (d.approved_tx) steps.push({ label: `Owner approved ${usd(d.remainder ?? 0)} USDC`, link: d.approved_tx, tone: "done" });
      else if (d.human_agreed === 0) steps.push({ label: "Owner declined", tone: "bad" });
      else steps.push({ label: `Waiting for the owner to approve ${usd(d.remainder ?? 0)} USDC`, detail: "they get a notification; nothing to do on your side", tone: "wait" });
    }
    if (d.action === "HOLD") steps.push({ label: "On hold", detail: "add a link to the work and submit again", tone: "wait" });
    if (d.action === "SCREEN_FAIL") steps.push({ label: "Blocked", detail: "this payee failed screening; contact the owner", tone: "bad" });
  }
  return (
    <ol className="mt-2 space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2 text-xs">
          <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${s.tone === "done" ? "bg-emerald-400" : s.tone === "bad" ? "bg-red-400" : "bg-zinc-600 animate-pulse"}`} />
          <span className="text-zinc-300">{s.label}{s.detail && <span className="text-zinc-500"> — {s.detail}</span>}{s.at ? <span className="text-zinc-600"> · {ago(s.at)}</span> : null}{s.link && <> · <a className="underline text-zinc-400" href={tx(s.link)} target="_blank">on-chain ↗</a></>}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Page() {
  const { token } = useParams<{ token: string }>();
  const [p, setP] = useState<Portal | null>(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ title: "", amount: "", evidence_url: "" });
  const [xchain, setXchain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const load = useCallback(() => get<Portal>(`/c/${token}`).then((x) => { setP(x); setErr(""); }).catch((e) => setErr(String(e.message) === "404" ? "This link is not valid. Ask the person paying you for a new one." : "Could not load your page.")), [token]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const submit = async () => {
    setBusy(true); setNote("");
    const r = await post<{ id?: string; detail?: string }>(`/c/${token}/requests`, { title: f.title, amount: Math.round(+f.amount * 1e6), evidence_url: f.evidence_url, payout_chain: xchain ? "base-sepolia" : "arc" });
    setBusy(false);
    if (!r.ok) { setNote(r.data.detail ?? `Failed (${r.status})`); return; }
    setNote("Submitted. The agent reviews within a few minutes; this page updates by itself."); setF({ title: "", amount: "", evidence_url: "" }); load();
  };

  if (err) return <div className="max-w-xl text-zinc-300">{err}</div>;
  if (!p) return <div className="text-zinc-500">Loading…</div>;
  const over = +f.amount > p.policy.per_tx / 1e6;
  const overPeriod = +f.amount > p.budget.remaining_this_period / 1e6;
  return (
    <div className="space-y-8 max-w-3xl">
      <section>
        <div className="text-xs text-zinc-500 uppercase tracking-wide">Paid by</div>
        <h1 className="text-2xl font-semibold">{p.payer}</h1>
        <div className="text-zinc-400 text-sm mt-1">Hi {p.name}. This is your private page: request payment for delivered work and track every request. Payments arrive in USDC on Arc{p.has_circle_wallet ? " in the wallet set up for you" : ` at ${p.address.slice(0, 8)}…`}.</div>
      </section>

      <section className="rounded-lg border border-zinc-800 p-4 grid grid-cols-3 gap-3">
        <div><div className="text-xs text-zinc-500">max per payment</div><div className="text-xl font-semibold">{usd(p.policy.per_tx)}</div></div>
        <div><div className="text-xs text-zinc-500">left {periodLabel(p.policy.period)}</div><div className="text-xl font-semibold">{usd(p.budget.remaining_this_period)}</div><div className="text-[11px] text-zinc-600">of {usd(p.policy.cap_period)}{p.budget.period_end ? ` · resets ${when(p.budget.period_end)}` : ""}</div></div>
        <div><div className="text-xs text-zinc-500">funded right now</div><div className="text-xl font-semibold">{usd(p.budget.funded)}</div></div>
      </section>

      {p.status === "revoked" ? (
        <div className="text-red-300 text-sm">This engagement has ended; new requests are not accepted.</div>
      ) : (
        <section className="rounded-lg border border-zinc-800 p-4 space-y-3">
          <div className="font-medium">Request a payment</div>
          <label className="block text-sm"><span className="text-zinc-400">What you delivered</span>
            <input className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2" placeholder="Logo v2 — final files" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="block text-sm"><span className="text-zinc-400">Link to the work (Drive, Figma, GitHub, invoice PDF…)</span>
            <input className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2" placeholder="https://…" value={f.evidence_url} onChange={(e) => setF({ ...f, evidence_url: e.target.value })} />
            {!f.evidence_url && <span className="text-xs text-zinc-500">Without a link the request goes on hold.</span>}</label>
          <label className="block text-sm"><span className="text-zinc-400">Amount (USDC)</span>
            <input className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2" inputMode="decimal" placeholder="150" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            {f.amount && over && <span className="text-xs text-amber-300">Above the {usd(p.policy.per_tx)} per-payment cap — the owner will be asked to approve it.</span>}
            {f.amount && !over && overPeriod && <span className="text-xs text-amber-300">More than what's left this period — the agent pays what fits and asks the owner for the rest.</span>}</label>
          <label className="flex items-start gap-2 text-xs text-zinc-500 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={xchain} onChange={(e) => setXchain(e.target.checked)} />
            <span>Receive on Base Sepolia instead (via Circle CCTP). The owner executes the transfer after a one-tap approval.</span>
          </label>
          <button disabled={busy || !f.title.trim() || !(+f.amount > 0)} onClick={submit} className="rounded bg-zinc-100 text-zinc-900 disabled:opacity-50 px-4 py-2 text-sm font-medium">{busy ? "Submitting…" : "Submit request"}</button>
          {note && <div className="text-sm text-zinc-300">{note}</div>}
        </section>
      )}

      <section className="space-y-2">
        <div className="font-medium">Your requests</div>
        {p.requests_list.length === 0 && <div className="text-zinc-500 text-sm">None yet.</div>}
        {p.requests_list.map((m) => (
          <div key={m.id} className="rounded-lg border border-zinc-800 p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="font-medium">{m.title}</span>
              <span>{usd(m.amount)} USDC</span>
              <span className={`text-xs rounded-full border px-2 py-0.5 ${STATUS_COLOR[m.status] ?? ""}`}>{STATUS_TEXT[m.status] ?? m.status}</span>
              {m.evidence_url && <a className="text-xs underline text-zinc-400" href={m.evidence_url} target="_blank">work ↗</a>}
              <span className="ml-auto text-xs text-zinc-500">{when(m.created_at)}</span>
            </div>
            <Timeline m={m} />
          </div>
        ))}
      </section>
      <div className="text-[11px] text-zinc-600">Powered by STEWARD on Arc. Your budget lives in a smart contract the payer cannot overdraw and the agent cannot exceed.</div>
    </div>
  );
}
