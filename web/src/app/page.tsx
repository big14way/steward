import Link from "next/link";
import { get, usd, tx, when, short, ACTION_COLOR, EXPLORER, type Stats, type Decision, type Health, type Treasury } from "@/lib/api";

export const dynamic = "force-dynamic";

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

export default async function Home() {
  const [s, d, h, t] = await Promise.all([
    safe(get<Stats>("/stats"), null as unknown as Stats),
    safe(get<Decision[]>("/decisions?limit=20"), [] as Decision[]),
    safe(get<Health>("/health"), null as unknown as Health),
    safe(get<Treasury>("/treasury"), null as unknown as Treasury),
  ]);
  if (!s) {
    return <div className="text-zinc-400">API unreachable at <code>{process.env.NEXT_PUBLIC_API}</code>. Start <code>api/</code> first.</div>;
  }
  const cards: [string, string | number][] = [
    ["Allowances", s.allowances], ["Payers", s.payers], ["Contractors", s.contractors], ["USDC paid", s.usdc_paid.toFixed(2)],
    ["Decisions", s.decisions], ["Human agreed", s.human_agreed_pct == null ? "—" : `${s.human_agreed_pct}%`],
    ["On time", s.on_time_pct == null ? "—" : `${s.on_time_pct}%`], ["USYC swept", s.usyc_swept.toFixed(2)],
  ];
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">On-chain allowances + decision log for agents that pay people on Arc</h1>
        <p className="text-zinc-400 mt-2 max-w-3xl">
          The contract, not the prompt, caps what the agent can pay each payee. Every decision — including holds — is hashed and recorded on-chain.
          Over-policy requests go to a human with one tap.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-zinc-800 p-4">
            <div className="text-xs text-zinc-400">{k}</div>
            <div className="text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-zinc-500">
        by action: {Object.entries(s.by_action).map(([a, n]) => `${a} ${n}`).join(" · ")} · SDK integrators {s.integrators} · updated {when(s.updated_at)}
        {h && <> · AllowanceManager <a className="underline" href={`${h.explorer}/address/${h.allowance_manager}`} target="_blank">{short(h.allowance_manager)}</a> · block {h.block} · owner signer {h.owner_signer}</>}
      </div>
      {t && t.sweeper && (
        <div className="rounded-lg border border-zinc-800 p-4 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-4 text-sm">
            <span className="font-medium">Treasury</span>
            <span className="text-zinc-400">idle USDC parks in {t.vault ? <a className="underline" href={`${EXPLORER}/address/${t.vault}`} target="_blank">the vault</a> : "the vault"} between pay cycles; floor {usd(t.floor ?? 0)} stays liquid</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><div className="text-zinc-500">liquid</div><div className="text-base">{usd(t.balance ?? 0)}</div></div>
            <div><div className="text-zinc-500">in vault</div><div className="text-base">{usd(t.position_assets ?? 0)}</div></div>
            <div><div className="text-zinc-500">events</div><div className="text-base">{t.events.length}</div></div>
          </div>
          {t.events.slice(0, 3).map((e) => (
            <div key={e.id} className="text-xs text-zinc-400 font-mono">{e.action} {usd(e.assets)} · <a className="underline" href={tx(e.tx)} target="_blank">{short(e.tx)}</a> · {when(e.created_at)}</div>
          ))}
        </div>
      )}
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">Latest decisions</h2>
        <Link href="/decisions" className="text-sm text-zinc-400 underline">all →</Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-400 text-left"><tr><th className="py-1">Action</th><th>Amount</th><th>Rule</th><th>Reason</th><th>When</th><th className="text-center">Tx</th></tr></thead>
          <tbody>
            {d.length === 0 && <tr><td colSpan={6} className="py-3 text-zinc-500">No decisions yet.</td></tr>}
            {d.map((x) => (
              <tr key={x.hash} className="border-t border-zinc-800 align-top">
                <td className={`py-2 font-mono ${ACTION_COLOR[x.action] ?? ""}`}>{x.action}</td>
                <td>{usd(x.amount)}{x.remainder > 0 && <span className="text-zinc-500"> +{usd(x.remainder)} esc.</span>}</td>
                <td className="text-zinc-400">{x.rule}</td>
                <td className="max-w-md truncate" title={x.reason}>{x.reason}</td>
                <td className="text-zinc-500 whitespace-nowrap">{when(x.created_at)}</td>
                <td className="text-center"><a className="underline" href={tx(x.pay_tx ?? x.approved_tx ?? x.escalate_tx ?? x.record_tx)} target="_blank">↗</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
