import { when, ruleText, ACTION_TEXT, decisionLabel, amountLabel, type Decision } from "@/lib/api";
import { serverGet } from "@/lib/server";
import { Card, PageHeader, Pill, TxLink } from "../ui";

export const dynamic = "force-dynamic";
const TONE: Record<string, "emerald" | "amber" | "zinc" | "orange" | "red" | "sky"> = { PAY: "emerald", PARTIAL: "amber", HOLD: "zinc", ESCALATE: "orange", SCREEN_FAIL: "red" };

export default async function Page({ searchParams }: { searchParams: Promise<{ action?: string; allowance?: string }> }) {
  const { action, allowance } = await searchParams;
  const q = new URLSearchParams({ limit: "500" });
  if (action) q.set("action", action);
  if (allowance) q.set("allowance_id", allowance);
  const d = await serverGet<Decision[]>(`/decisions?${q}`, `/activity${action ? `?action=${action}` : ""}`).catch((e) => { if (String(e?.digest ?? "").startsWith("NEXT_REDIRECT")) throw e; return [] as Decision[]; });
  const actions = ["", "PAY", "PARTIAL", "HOLD", "ESCALATE", "SCREEN_FAIL"];
  const href = (a: string) => `/activity${a ? `?action=${a}` : ""}${allowance ? `${a ? "&" : "?"}allowance=${allowance}` : ""}`;
  return (
    <div>
      <PageHeader title="Activity" description={<>One row per agent decision{allowance ? ` for budget #${allowance}` : ""}. The hash is keccak256 of the canonical record (what the agent saw, which rule fired, the amount, the reason) and is exactly what was written to <code>AuditLog</code> and passed to <code>pay()</code>. Open a row to replay it.</>} />
      <div className="flex flex-wrap gap-1 mb-4 text-sm">
        {actions.map((a) => (
          <a key={a} href={href(a)} className={`rounded-md px-2.5 py-1.5 ${a === (action ?? "") ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"}`}>{a ? ACTION_TEXT[a] : "All"}</a>
        ))}
      </div>
      <Card className="divide-y divide-zinc-800">
        <div className="hidden md:grid grid-cols-[180px_minmax(0,1fr)_150px_minmax(0,1.2fr)_110px_190px] gap-x-3 px-4 py-2 text-xs text-zinc-500">
          <div>Decision</div><div>Rule</div><div className="text-right">Amount</div><div>Reason</div><div className="text-right">When</div><div className="text-right">On-chain</div>
        </div>
        {d.length === 0 && <div className="p-6 text-zinc-500 text-sm">Nothing here yet.</div>}
        {d.map((x) => (
          <details key={x.hash} className="group">
            <summary className="cursor-pointer list-none grid md:grid-cols-[180px_minmax(0,1fr)_150px_minmax(0,1.2fr)_110px_190px] gap-x-3 gap-y-1 px-4 py-3 text-sm items-center hover:bg-zinc-900/60">
              <div><Pill tone={decisionLabel(x).tone}>{decisionLabel(x).text}</Pill></div>
              <div className="text-zinc-300">#{x.allowance_id} · {ruleText(x.rule)}</div>
              <div className="md:text-right tabular-nums font-medium leading-tight">{amountLabel(x).value}{amountLabel(x).note && <div className="text-[11px] text-zinc-500 font-normal">{amountLabel(x).note}</div>}</div>
              <div className="text-zinc-400 truncate" title={x.reason}>{x.reason}</div>
              <div className="md:text-right text-zinc-500 text-xs whitespace-nowrap">{when(x.created_at)}</div>
              <div className="md:text-right"><TxLink hash={x.mint_tx ?? x.pay_tx ?? x.approved_tx ?? x.escalate_tx ?? x.record_tx} chain={x.mint_tx ? "base-sepolia" : "arc"} /></div>
            </summary>
            <div className="px-4 pb-4 text-xs space-y-1 font-mono break-all bg-zinc-950/60">
              <div className="text-zinc-300 font-sans text-sm mb-2">{x.reason}</div>
              <div className="font-sans text-[11px] uppercase tracking-wide text-zinc-500 mt-1 mb-1">Where it happened on-chain</div>
              <ol className="font-sans space-y-1.5 mb-3">
                {x.record_tx && <li className="flex flex-wrap items-center gap-2"><span className="w-56 text-zinc-400">Decision recorded · AuditLog.record()</span><TxLink hash={x.record_tx} /></li>}
                {x.pay_tx && <li className="flex flex-wrap items-center gap-2"><span className="w-56 text-zinc-400">Paid by the agent · pay()</span><TxLink hash={x.pay_tx} /></li>}
                {x.escalate_tx && <li className="flex flex-wrap items-center gap-2"><span className="w-56 text-zinc-400">Sent to the owner · escalate()</span><TxLink hash={x.escalate_tx} /></li>}
                {x.approved_tx && !x.mint_tx && <li className="flex flex-wrap items-center gap-2"><span className="w-56 text-zinc-400">Owner approved · approveAndPay()</span><TxLink hash={x.approved_tx} /></li>}
                {x.approved_tx && x.mint_tx && <li className="flex flex-wrap items-center gap-2"><span className="w-56 text-zinc-400">Burned by CCTP · depositForBurn()</span><TxLink hash={x.approved_tx} /></li>}
                {x.mint_tx && <li className="flex flex-wrap items-center gap-2"><span className="w-56 text-zinc-400">Minted to the contractor · receiveMessage()</span><TxLink hash={x.mint_tx} chain="base-sepolia" /></li>}
              </ol>
              <div>decision hash {x.hash}</div>
              {x.escalation_hash && x.escalation_hash !== x.hash && <div>remainder hash {x.escalation_hash}</div>}
              {x.human_agreed != null && <div>owner {x.human_agreed ? "approved" : "declined"}</div>}
              <div>reason by {x.source === "llm" ? "LLM" : "rules"}{x.timing && x.timing !== "now" ? ` · ${x.timing}` : ""}</div>
              {x.canonical && (
                <details className="mt-2"><summary className="cursor-pointer text-zinc-400">canonical record (keccak256 of this text = hash)</summary>
                  <pre className="mt-1 whitespace-pre-wrap text-[11px] text-zinc-300">{x.canonical}</pre></details>
              )}
            </div>
          </details>
        ))}
      </Card>
    </div>
  );
}
