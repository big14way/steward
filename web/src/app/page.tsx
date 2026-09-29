import Link from "next/link";
import { ArrowRight, ShieldCheck, ScrollText, Inbox, Wallet, Link2, Code2, CheckCircle2, ArrowUpRight, ExternalLink } from "lucide-react";
import { get, type Stats } from "@/lib/api";

export const dynamic = "force-dynamic";

async function stats(): Promise<Stats | null> {
  try { return await get<Stats>("/stats"); } catch { return null; }
}

function Shot({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50 overflow-hidden ${className}`}>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800 bg-zinc-950/60">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-700" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="ml-3 text-[11px] text-zinc-500 truncate">steward-arc.vercel.app</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block w-full h-auto" loading="lazy" />
    </div>
  );
}

export default async function Landing() {
  const s = await stats();
  const strip: [string, string][] = s ? [
    ["USDC paid out", s.usdc_paid.toFixed(2)], ["Contractors on-chain", String(s.contractors)], ["Agent decisions", String(s.decisions)],
    ["Owner agreed", s.human_agreed_pct == null ? "—" : `${s.human_agreed_pct}%`], ["Paid within 24 h", s.on_time_pct == null ? "—" : `${s.on_time_pct}%`],
  ] : [];
  return (
    <div className="space-y-24 pb-8">
      {/* hero */}
      <section className="pt-8 sm:pt-16 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live on Arc Testnet · Circle wallets · Tameion 2026
        </div>
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">Let your AI agent pay people.<br /><span className="text-zinc-400">Within limits it can’t cross.</span></h1>
        <p className="mt-6 text-lg text-zinc-400 max-w-2xl mx-auto">
          STEWARD gives every contractor a budget enforced by a smart contract, writes down why every payment happened, and asks you only when a request is over policy. USDC on Arc, signed by Circle wallets, nothing to install.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-md bg-emerald-500 text-zinc-950 px-5 py-3 font-medium hover:bg-emerald-400">Open the dashboard<ArrowRight className="h-4 w-4" /></Link>
          <a href="https://github.com/big14way/steward" target="_blank" className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-5 py-3 hover:bg-zinc-800"><ExternalLink className="h-4 w-4" />Source & contracts</a>
        </div>
      </section>

      {/* product shot */}
      <section className="max-w-5xl mx-auto -mt-8">
        <Shot src="/shots/dashboard.jpg" alt="STEWARD owner dashboard: balance, budgets, decisions" />
      </section>

      {/* live strip */}
      {s && (
        <section className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          {strip.map(([k, v]) => (
            <div key={k}><div className="text-2xl sm:text-3xl font-semibold tabular-nums">{v}</div><div className="text-xs text-zinc-500 mt-1">{k}</div></div>
          ))}
          <div className="col-span-2 sm:col-span-5 text-[11px] text-zinc-600">live numbers from the contract and the agent’s audit log · Arc Testnet</div>
        </section>
      )}

      {/* the problem / three guarantees */}
      <section className="max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">A ledger checks that debits equal credits. It can’t tell you the vendor was right, the invoice was real, or that a retry didn’t pay twice.</h2>
          <p className="mt-4 text-zinc-400">Circle’s developer wallets say it plainly: they “do not include a built-in policy engine.” STEWARD is that engine, on-chain.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            [ShieldCheck, "Budgets the agent can’t exceed", "Per contractor: a cap per payment, a cap per week, an expiry, and a kill switch. Enforced by AllowanceManager on Arc, not by a prompt."],
            [ScrollText, "Every decision, replayable", "The inputs the agent saw, the rule it applied, the reason it wrote — hashed and recorded on-chain, including holds. One hash pays exactly once."],
            [Inbox, "Humans only for exceptions", "Over-policy requests land in an approvals inbox and on Telegram. One tap pays from the owner’s Circle wallet. Screening failures can’t be approved at all."],
          ].map(([Icon, h, body]) => { const I = Icon as typeof ShieldCheck; return (
            <div key={h as string} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
              <I className="h-5 w-5 text-emerald-400" /><div className="mt-3 font-medium text-lg">{h as string}</div><div className="mt-2 text-sm text-zinc-400">{body as string}</div>
            </div>); })}
        </div>
      </section>

      {/* how it works */}
      <section className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Three steps. No wallet setup for the people you pay.</h2>
          <ol className="mt-6 space-y-5">
            {[
              ["Set a budget", "Add a contractor: name, per-payment cap, weekly cap, funding. No wallet? STEWARD creates a Circle wallet for them and hands you a private link."],
              ["They request, the agent decides", "On their link they describe the work, attach evidence and an amount. The agent screens the payee, checks evidence, caps and liquidity, pays what fits, and records the reason."],
              ["You approve only the exceptions", "Anything over policy waits for one tap. Everything else already happened, on-chain, with a paper trail an auditor can replay."],
            ].map(([h, b], i) => (
              <li key={h} className="flex gap-4"><span className="h-8 w-8 shrink-0 rounded-full bg-zinc-800 grid place-items-center text-sm font-medium">{i + 1}</span><div><div className="font-medium">{h}</div><div className="text-sm text-zinc-400 mt-1">{b}</div></div></li>
            ))}
          </ol>
        </div>
        <Shot src="/shots/contractor-page.jpg" alt="The contractor’s private page: budget, request form, status timeline" />
      </section>

      {/* owner side */}
      <section className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
        <Shot src="/shots/approvals.jpg" alt="Approvals inbox with a plain-English reason and one-tap approve" className="order-2 lg:order-1" />
        <div className="order-1 lg:order-2">
          <div className="text-xs uppercase tracking-wide text-emerald-400">For owners</div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">An inbox instead of a hot key.</h2>
          <p className="mt-4 text-zinc-400">Contractors, budgets, an approvals inbox, an audit log and a treasury that parks idle USDC in a yield vault between pay cycles. The owner signs from a Circle Developer-Controlled wallet; no private key lives on any server.</p>
          <ul className="mt-5 space-y-2 text-sm text-zinc-300">
            {["Add a contractor in three steps, with a confirm summary", "Plain-English reasons: “Above the 3.00 USDC per-payment cap”", "Explorer links for every record, pay, escalate and approve transaction", "Cross-chain payout to Base Sepolia via Circle CCTP, owner-executed"].map((t) => (
              <li key={t} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* developers */}
      <section className="max-w-5xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 grid lg:grid-cols-[1fr_1.1fr] gap-8 items-center">
        <div>
          <div className="text-xs uppercase tracking-wide text-emerald-400">For agent builders</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Ten lines in front of any agent that pays.</h2>
          <p className="mt-3 text-zinc-400 text-sm">The same contracts and rules, as a library. TypeScript and Python produce byte-identical decision hashes.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/sdk" className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm"><Code2 className="h-4 w-4" />SDK docs</Link>
            <a href="https://github.com/big14way/steward/tree/main/packages/steward-sdk" target="_blank" className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm">packages/steward-sdk<ArrowUpRight className="h-3.5 w-3.5" /></a>
          </div>
        </div>
        <pre className="text-xs sm:text-sm bg-zinc-950 border border-zinc-800 rounded-lg p-4 overflow-auto text-zinc-300">{`import { Steward } from "steward-sdk";

const s = new Steward({ allowanceManager, auditLog, account });
const r = await s.decide({
  allowanceId: 0n, amount: 150_000_000n, memo: "logo v2",
  inputs: { evidence: "ipfs://…" }, evidence: true, screenOk: true,
});
// r.action → "PAY" | "PARTIAL" | "HOLD" | "ESCALATE" | "SCREEN_FAIL"
// r.hash   → keccak256 of the canonical decision, recorded on-chain`}</pre>
      </section>

      {/* trust */}
      <section className="max-w-4xl mx-auto text-center">
        <div className="text-xs uppercase tracking-wide text-zinc-500">Built on</div>
        <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
          {[["Arc", "USDC-native L1, chain 5042002"], ["Circle Developer-Controlled Wallets", "owner, agent and contractor wallets"], ["Circle Contracts", "deployed & imported"], ["CCTP V2", "payouts to Base Sepolia"], ["USYC / ERC-4626", "idle cash earns"]].map(([n, d]) => (
            <div key={n} className="rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-2"><span className="font-medium">{n}</span><span className="text-zinc-500"> · {d}</span></div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-md bg-emerald-500 text-zinc-950 px-5 py-3 font-medium hover:bg-emerald-400"><Wallet className="h-4 w-4" />Open the dashboard</Link>
          <Link href="/contractor" className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-5 py-3 hover:bg-zinc-800"><Link2 className="h-4 w-4" />I’m a contractor with my own wallet</Link>
        </div>
      </section>
    </div>
  );
}
