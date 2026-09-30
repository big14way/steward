const TS = `import { Steward } from "@big14way/steward-sdk";
import { privateKeyToAccount } from "viem/accounts";

const s = new Steward({
  allowanceManager: "0x…",           // deployed on Arc Testnet (see README)
  auditLog: "0x…",
  account: privateKeyToAccount(process.env.AGENT_PK as \`0x\${string}\`),
});

// rules → canonical hash → AuditLog.record() → pay() | escalate()
const r = await s.decide({
  allowanceId: 0n, amount: 150_000_000n, memo: "logo v2",
  inputs: { milestone: "logo v2", evidence: "ipfs://…" }, evidence: true, screenOk: true,
});
console.log(r.action, r.hash, r.payTx ?? r.escalateTx);`;

const PY = `from steward_sdk import Steward

s = Steward(allowance_manager="0x…", audit_log="0x…", agent_private_key=os.environ["AGENT_PK"])
r = s.decide(allowance_id=0, amount=150_000_000, memo="logo v2",
             inputs={"milestone": "logo v2", "evidence": "ipfs://…"}, evidence=True, screen_ok=True)
print(r.action, r.hash, r.pay_tx or r.escalate_tx)`;

export default function Page() {
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">steward-sdk</h1>
      <p className="text-zinc-400 text-sm">
        If your Tameion agent pays anyone in USDC, put STEWARD in front of it: one contract call gives you per-payee caps + period limits +
        expiry the agent can't exceed, an on-chain decision log, and an escalation path. Ten lines. Publishing on npm and PyPI on Day 9.
      </p>
      <div className="space-y-2">
        <div className="text-sm text-zinc-300">TypeScript · <code>npm i @big14way/steward-sdk viem</code></div>
        <pre className="text-xs bg-zinc-900 border border-zinc-800 rounded p-4 overflow-auto">{TS}</pre>
      </div>
      <div className="space-y-2">
        <div className="text-sm text-zinc-300">Python · <code>pip install steward-sdk</code></div>
        <pre className="text-xs bg-zinc-900 border border-zinc-800 rounded p-4 overflow-auto">{PY}</pre>
      </div>
      <div className="text-sm text-zinc-400">
        What you get: the agent never holds more than the allowance; every decision (including HOLD) is hashed and recorded on-chain; a decision hash pays once
        even if your agent retries; anything over policy becomes an escalation a human approves with one tap. Fork the contract from{" "}
        <a className="underline" href="https://github.com/big14way/steward" target="_blank">github.com/big14way/steward</a>.
      </div>
    </div>
  );
}
