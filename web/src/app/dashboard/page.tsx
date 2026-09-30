import Link from "next/link";
import { ArrowUpRight, Users, Inbox, ScrollText, Wallet, Coins, CheckCheck, Timer, PiggyBank, Gauge } from "lucide-react";
import { usd, ago, short, ruleText, decisionLabel, amountLabel, EXPLORER, type Stats, type Decision, type Account, type Treasury } from "@/lib/api";
import { serverGet } from "@/lib/server";
import { Card, Pill, Stat, TxLink } from "../ui";

export const dynamic = "force-dynamic";

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}
const TONE: Record<string, "emerald" | "amber" | "zinc" | "orange" | "red" | "sky"> = { PAY: "emerald", PARTIAL: "amber", HOLD: "zinc", ESCALATE: "orange", SCREEN_FAIL: "red", SWEEP: "sky", REDEEM: "sky" };

export default async function Dashboard() {
  const [s, d, a, t] = await Promise.all([
    safe(serverGet<Stats>("/stats", "/dashboard"), null as unknown as Stats),
    serverGet<Decision[]>("/decisions?limit=8", "/dashboard").catch(() => [] as Decision[]),
    safe(serverGet<Account>("/account", "/dashboard"), null as unknown as Account),
    safe(serverGet<Treasury>("/treasury", "/dashboard"), null as unknown as Treasury),
  ]);
  if (!s) {
    return <div className="text-zinc-400">The API is not reachable. Start <code>api/</code> first.</div>;
  }
  return (
    <div className="space-y-8">
      <section className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 text-xs text-zinc-400"><Wallet className="h-3.5 w-3.5" />{a?.payer ?? "Owner"} · owner wallet</div>
          <div className="mt-2 text-4xl font-semibold tracking-tight">{a ? usd(a.owner_usdc) : "—"} <span className="text-lg text-zinc-500 font-normal">USDC</span></div>
          <div className="mt-1 text-xs text-zinc-500">
            {a && <>+ {usd(a.in_budgets)} locked in {a.budgets} budget{a.budgets === 1 ? "" : "s"}{a.in_reserve != null && <> · {usd(a.in_reserve)} in reserve</>} · agent gas {a.agent_usdc != null ? usd(a.agent_usdc) : "—"}</>}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/contractors" className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 text-zinc-950 px-4 py-2 text-sm font-medium hover:bg-emerald-400"><Users className="h-4 w-4" />Add a contractor</Link>
            <Link href="/approvals" className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-700"><Inbox className="h-4 w-4" />Approvals</Link>
            {a && <a href={a.faucet} target="_blank" className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-700"><Coins className="h-4 w-4" />Get test USDC<ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" /></a>}
          </div>
          {a && <div className="mt-4 text-[11px] text-zinc-600 font-mono">owner <a className="underline" href={`${EXPLORER}/address/${a.owner}`} target="_blank">{short(a.owner)}</a>{a.agent && <> · agent <a className="underline" href={`${EXPLORER}/address/${a.agent}`} target="_blank">{short(a.agent)}</a></>}</div>}
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={<Coins className="h-3.5 w-3.5" />} label="Paid out" value={`${s.usdc_paid.toFixed(2)} USDC`} sub={`${s.milestones_paid} requests paid`} />
          <Stat icon={<Users className="h-3.5 w-3.5" />} label="Contractors" value={s.contractors} sub={`${s.allowances} budgets on-chain`} />
          <Stat icon={<Gauge className="h-3.5 w-3.5" />} label="Decisions" value={s.decisions} sub={`${s.by_action.PAY ?? 0} paid · ${s.by_action.ESCALATE ?? 0} escalated · ${s.by_action.HOLD ?? 0} held · ${s.by_action.SCREEN_FAIL ?? 0} blocked`} />
          <Stat icon={<CheckCheck className="h-3.5 w-3.5" />} label="Owner agreed" value={s.human_agreed_pct == null ? "—" : `${s.human_agreed_pct}%`} sub="of escalations approved" />
          <Stat icon={<Timer className="h-3.5 w-3.5" />} label="On time" value={s.on_time_pct == null ? "—" : `${s.on_time_pct}%`} sub="paid within 24 h" />
          <Stat icon={<PiggyBank className="h-3.5 w-3.5" />} label="Idle cash earning" value={`${usd(t?.position_assets ?? 0)}`} sub={`${s.usyc_swept.toFixed(2)} USDC swept in total`} />
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-3">
        {[
          [Users, "1 · You set a budget", "Add a contractor with a per-payment cap, a weekly cap, and how much to fund. No wallet? STEWARD creates a Circle wallet for them. They get a private link."],
          [ScrollText, "2 · They request, the agent decides", "On their link they describe the work, attach evidence, enter an amount. The agent checks screening, evidence, caps and liquidity, pays what fits, and records the reason on-chain."],
          [Inbox, "3 · You approve only the exceptions", "Anything over policy lands in Approvals (and Telegram). One tap pays it from your Circle wallet. Screening failures can never be approved — the chain itself rejects them."],
        ].map(([Icon, h2, body]) => {
          const I = Icon as typeof Users;
          return (
            <Card key={h2 as string} className="p-4">
              <div className="flex items-center gap-2 font-medium"><I className="h-4 w-4 text-emerald-400" />{h2 as string}</div>
              <div className="text-sm text-zinc-400 mt-1.5">{body as string}</div>
            </Card>
          );
        })}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-medium">Latest decisions</h2>
          <Link href="/activity" className="text-sm text-zinc-400 hover:text-white">Full audit log →</Link>
        </div>
        <Card className="divide-y divide-zinc-800">
          {d.length === 0 && <div className="p-6 text-zinc-500 text-sm">No decisions yet. Add a contractor and have them submit a request.</div>}
          {d.map((x) => (
            <div key={x.hash} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <Pill tone={decisionLabel(x).tone}>{decisionLabel(x).text}</Pill>
              <span className="font-medium tabular-nums">{amountLabel(x).value} USDC{amountLabel(x).note && <span className="text-zinc-500 font-normal"> · {amountLabel(x).note}</span>}</span>
              <span className="text-zinc-400">{ruleText(x.rule)}</span>
              <span className="text-zinc-500 ml-auto whitespace-nowrap">{ago(x.created_at)}</span>
              <TxLink hash={x.mint_tx ?? x.pay_tx ?? x.approved_tx ?? x.escalate_tx ?? x.record_tx} chain={x.mint_tx ? "base-sepolia" : "arc"} />
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
