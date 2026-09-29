import Link from "next/link";
import { get, usd, tx, ago, short, ruleText, ACTION_TEXT, ACTION_COLOR, EXPLORER, type Stats, type Decision, type Health, type Treasury } from "@/lib/api";

export const dynamic = "force-dynamic";

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

export default async function Home() {
  const [s, d, h, t] = await Promise.all([
    safe(get<Stats>("/stats"), null as unknown as Stats),
    safe(get<Decision[]>("/decisions?limit=8"), [] as Decision[]),
    safe(get<Health>("/health"), null as unknown as Health),
    safe(get<Treasury>("/treasury"), null as unknown as Treasury),
  ]);
  if (!s) {
    return <div className="text-zinc-400">The API is not reachable at <code>{process.env.NEXT_PUBLIC_API}</code>. Start <code>api/</code> first.</div>;
  }
  const cards: [string, string | number, string][] = [
    ["Paid out", `${s.usdc_paid.toFixed(2)} USDC`, `${s.milestones_paid} requests paid`],
    ["Contractors", s.contractors, `${s.allowances} budgets on-chain`],
    ["Decisions", s.decisions, `${s.by_action.PAY ?? 0} paid · ${s.by_action.ESCALATE ?? 0} escalated · ${s.by_action.HOLD ?? 0} held · ${s.by_action.SCREEN_FAIL ?? 0} blocked`],
    ["Owner agreed", s.human_agreed_pct == null ? "—" : `${s.human_agreed_pct}%`, "of escalations approved"],
    ["On time", s.on_time_pct == null ? "—" : `${s.on_time_pct}%`, "paid within 24 h of the request"],
    ["Idle cash earning", `${(t?.position_assets ?? 0) / 1e6 > 0 ? usd(t!.position_assets!) : "0.00"} USDC`, `${s.usyc_swept.toFixed(2)} swept in total`],
  ];
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Let your agent pay people, within limits you set.</h1>
        <p className="text-zinc-400 max-w-3xl">
          Give each contractor a budget the contract enforces: a cap per payment, a cap per week, an expiry, and a kill switch. The agent pays
          approved work automatically, writes down why, and asks you only when a request is over policy. Every decision, including a hold, is
          hashed and recorded on Arc so an auditor can replay it.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/contractors" className="rounded bg-zinc-100 text-zinc-900 px-4 py-2 font-medium">Add a contractor</Link>
          <Link href="/approvals" className="rounded border border-zinc-700 px-4 py-2">Review approvals</Link>
          <Link href="/activity" className="rounded border border-zinc-700 px-4 py-2">Audit log</Link>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map(([k, v, sub]) => (
          <div key={k} className="rounded-lg border border-zinc-800 p-4">
            <div className="text-xs text-zinc-400">{k}</div>
            <div className="text-2xl font-semibold mt-1">{v}</div>
            <div className="text-xs text-zinc-500 mt-1">{sub}</div>
          </div>
        ))}
      </section>

      <section className="grid md:grid-cols-3 gap-3">
        {[
          ["1 · You set a budget", "Add a contractor with a per-payment cap, a weekly cap, and how much to fund. If they have no wallet, STEWARD creates a Circle wallet for them. They get a private link."],
          ["2 · They request, the agent decides", "On their link they describe the work, attach evidence, and enter an amount. The agent checks screening, evidence, caps and liquidity, pays what fits, and records the reason on-chain."],
          ["3 · You approve only the exceptions", "Anything over policy lands in Approvals (and Telegram). One tap pays it from your Circle wallet. Screening failures can never be approved — the chain itself would reject them."],
        ].map(([h2, body]) => (
          <div key={h2} className="rounded-lg border border-zinc-800 p-4">
            <div className="font-medium">{h2}</div>
            <div className="text-sm text-zinc-400 mt-1">{body}</div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Latest decisions</h2>
          <Link href="/activity" className="text-sm text-zinc-400 underline">full audit log →</Link>
        </div>
        {d.length === 0 && <div className="text-zinc-500 text-sm">No decisions yet. Add a contractor and have them submit a request.</div>}
        <div className="space-y-2">
          {d.map((x) => (
            <div key={x.hash} className="rounded-lg border border-zinc-800 p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className={`rounded-full border px-2 py-0.5 text-xs ${ACTION_COLOR[x.action] ?? ""}`}>{ACTION_TEXT[x.action] ?? x.action}</span>
              <span className="font-medium">{usd(x.amount)} USDC{x.remainder > 0 && <span className="text-zinc-500 font-normal"> · {usd(x.remainder)} pending approval</span>}</span>
              <span className="text-zinc-400">{ruleText(x.rule)}</span>
              <span className="text-zinc-500 ml-auto">{ago(x.created_at)}</span>
              <a className="underline text-zinc-400" href={tx(x.pay_tx ?? x.approved_tx ?? x.escalate_tx ?? x.record_tx)} target="_blank">on-chain ↗</a>
            </div>
          ))}
        </div>
      </section>

      {h && (
        <section className="text-xs text-zinc-500">
          Contract <a className="underline" href={`${EXPLORER}/address/${h.allowance_manager}`} target="_blank">{short(h.allowance_manager)}</a> · owner signer {h.owner_signer} · block {h.block}
        </section>
      )}
    </div>
  );
}
