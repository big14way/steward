import { get, usd, tx, when, ACTION_COLOR, BASE_SEPOLIA_EXPLORER, type Decision } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ action?: string; allowance?: string }> }) {
  const { action, allowance } = await searchParams;
  const q = new URLSearchParams({ limit: "500" });
  if (action) q.set("action", action);
  if (allowance) q.set("allowance_id", allowance);
  const d = await get<Decision[]>(`/decisions?${q}`).catch(() => [] as Decision[]);
  const actions = ["", "PAY", "PARTIAL", "HOLD", "ESCALATE", "SCREEN_FAIL"];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Decision log</h1>
      <p className="text-sm text-zinc-400 max-w-3xl">
        Each row is one agent cycle. The hash is keccak256 of the canonical JSON (inputs it saw, rule it applied, amount, reason) and is
        what <code>AuditLog.record()</code> and <code>AllowanceManager.pay()</code> received — open a row to replay it.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        {actions.map((a) => (
          <a key={a} href={`/decisions${a ? `?action=${a}` : ""}`} className={`px-2 py-1 rounded border ${a === (action ?? "") ? "border-zinc-300" : "border-zinc-800"}`}>{a || "ALL"}</a>
        ))}
      </div>
      {d.length === 0 && <div className="text-zinc-500">No decisions{action ? ` with action ${action}` : ""}.</div>}
      {d.map((x) => (
        <details key={x.hash} className="rounded border border-zinc-800 p-3">
          <summary className="cursor-pointer flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className={`font-mono w-28 ${ACTION_COLOR[x.action] ?? ""}`}>{x.action}</span>
            <span>{usd(x.amount)} USDC{x.remainder > 0 && <span className="text-zinc-500"> · {usd(x.remainder)} escalated</span>}</span>
            <span className="text-zinc-400">#{x.allowance_id} · {x.rule}</span>
            <span className="text-zinc-500">{x.source}{x.timing && x.timing !== "now" ? ` · ${x.timing}` : ""}</span>
            <span className="text-zinc-500 ml-auto whitespace-nowrap">{when(x.created_at)}</span>
            <span className="basis-full truncate text-zinc-300">{x.reason}</span>
          </summary>
          <div className="mt-3 text-xs space-y-1 font-mono break-all">
            <div>hash {x.hash}</div>
            {x.escalation_hash && x.escalation_hash !== x.hash && <div>remainder hash {x.escalation_hash}</div>}
            {x.record_tx && <div>record <a className="underline" href={tx(x.record_tx)} target="_blank">{x.record_tx}</a></div>}
            {x.pay_tx && <div>pay <a className="underline" href={tx(x.pay_tx)} target="_blank">{x.pay_tx}</a></div>}
            {x.escalate_tx && <div>escalate <a className="underline" href={tx(x.escalate_tx)} target="_blank">{x.escalate_tx}</a></div>}
            {x.approved_tx && <div>{x.mint_tx ? "burn (Arc)" : "approved"} <a className="underline" href={tx(x.approved_tx)} target="_blank">{x.approved_tx}</a></div>}
            {x.mint_tx && <div>mint (Base Sepolia) <a className="underline" href={`${BASE_SEPOLIA_EXPLORER}/tx/${x.mint_tx}`} target="_blank">{x.mint_tx}</a></div>}
            {x.human_agreed != null && <div>human {x.human_agreed ? "agreed (approved)" : "rejected"}</div>}
            {x.canonical && (
              <details className="mt-2"><summary className="cursor-pointer text-zinc-400">canonical JSON (replay: keccak256 of this text = hash)</summary>
                <pre className="mt-1 whitespace-pre-wrap text-[11px] text-zinc-300">{x.canonical}</pre></details>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
