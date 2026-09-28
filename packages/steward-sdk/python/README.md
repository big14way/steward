# steward-sdk

If your agent pays anyone in USDC on Arc, put STEWARD in front of it: one contract call gives you per-payee caps + period limits +
expiry the agent can't exceed, an on-chain decision log, and an escalation path. Ten lines.

Contracts + docs: https://github.com/big14way/steward (Tameion Agents Hackathon, Canteen × Circle × Arc).

## TypeScript

```bash
npm i steward-sdk viem
```

```ts
import { Steward } from "steward-sdk";
import { privateKeyToAccount } from "viem/accounts";

const s = new Steward({
  allowanceManager: "0x…",   // the owner created an allowance for your agent address + the payee
  auditLog: "0x…",
  account: privateKeyToAccount(process.env.AGENT_PK as `0x${string}`),
});

// rules → canonical hash → AuditLog.record() → pay() | escalate()
const r = await s.decide({
  allowanceId: 0n, amount: 150_000_000n, memo: "logo v2",
  inputs: { milestone: "logo v2", evidence: "ipfs://…" }, evidence: true, screenOk: true,
  reason: "Milestone delivered with evidence; within per-tx and period caps.",   // your LLM's text, never an amount
});
console.log(r.action, r.hash, r.payTx ?? r.escalateTx);
```

What `decide` does: `SCREEN_FAIL` if `screenOk === false` · `HOLD` if `evidence === false` · `ESCALATE` if over the per-tx cap or no room ·
`PARTIAL` if only part fits (pays that part, escalates the rest under `keccak256("STEWARD/remainder" ‖ hash)`) · else `PAY`.
Every outcome is `record()`ed on `AuditLog` with the keccak256 of a canonical JSON record you get back (`r.canonical`), so an auditor can replay it.
A decision hash pays once, even if you retry. Arc's 20 gwei floor is handled.

## Python

```bash
pip install steward-sdk
```

```python
from steward_sdk import Steward

s = Steward(allowance_manager="0x…", audit_log="0x…", agent_private_key=os.environ["AGENT_PK"])
r = s.decide(allowance_id=0, amount=150_000_000, memo="logo v2",
             inputs={"milestone": "logo v2", "evidence": "ipfs://…"}, evidence=True, screen_ok=True)
print(r.action, r.hash, r.pay_tx or r.escalate_tx)
```

## Owner side

The owner (a Circle Developer-Controlled wallet in the reference app) calls `create(agent, payee, capPerPeriod, perTxCap, period, expiry)`,
`fund(id, amount)`, `approveAndPay(id, amount, hash)` for escalations, and `revoke(id)` to pull unspent funds and lock the agent out.
The reference FastAPI service + Telegram bot in the main repo does this with one tap.
