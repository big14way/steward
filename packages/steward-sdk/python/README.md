# steward-sdk

If your agent pays anyone in USDC on Arc, put STEWARD in front of it: one contract call gives you per-payee caps + period limits +
expiry the agent can't exceed, an on-chain decision log, and an escalation path. Ten lines.

Contracts + docs: https://github.com/big14way/steward (Tameion Agents Hackathon, Canteen × Circle × Arc).

## TypeScript

```bash
npm i steward-arc-sdk viem
```

```ts
import { Steward } from "steward-arc-sdk";
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

## Agent on a Circle wallet (no raw key)

Most Arc agents sign with a Circle Developer-Controlled wallet. Pass the Circle client you already have instead of `account`;
STEWARD sends `record`, `pay` and `escalate` through Circle's contract-execution API and waits for the on-chain hash.
The allowance's `agent` must be that wallet's address. Same rules, same hashes.

```ts
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { Steward } from "steward-arc-sdk";

const client = initiateDeveloperControlledWalletsClient({ apiKey: process.env.CIRCLE_API_KEY!, entitySecret: process.env.CIRCLE_ENTITY_SECRET! });
const s = new Steward({
  allowanceManager: "0x3AAfC635a1D1391c9FD8b5B9d8A518Fe980cb7E6",   // Arc Testnet
  auditLog: "0x89264D27AFbCb2Ac90b8a3802340C26Ea1326866",
  circle: { client, walletId: process.env.AGENT_WALLET_ID! },
});
const r = await s.decide({ allowanceId: 0n, amount: 150_000_000n, memo: "logo v2", inputs: { milestone: "logo v2" } });
```

```python
# pip install "steward-sdk[circle]"
from circle.web3 import utils
from steward_sdk import Steward

client = utils.init_developer_controlled_wallets_client(api_key=os.environ["CIRCLE_API_KEY"], entity_secret=os.environ["CIRCLE_ENTITY_SECRET"])
s = Steward(allowance_manager="0x3AAfC635a1D1391c9FD8b5B9d8A518Fe980cb7E6", audit_log="0x89264D27AFbCb2Ac90b8a3802340C26Ea1326866",
            circle_client=client, circle_wallet_id=os.environ["AGENT_WALLET_ID"])
r = s.decide(allowance_id=0, amount=150_000_000, memo="logo v2", inputs={"milestone": "logo v2"})
```

Tested live on Arc Testnet with both SDKs (a `HOLD` recorded through a Circle wallet:
[TypeScript](https://explorer.testnet.arc.io/tx/0x1618d269880dae697842db31470db89e383e48b42450e829b0b8458f94e8a73f),
[Python](https://explorer.testnet.arc.io/tx/0xbb36c711456a84a2de37992f10b81409807db2436abdaecddb4d257bf9c1fda8)).

## Owner side

The owner (a Circle Developer-Controlled wallet in the reference app) calls `create(agent, payee, capPerPeriod, perTxCap, period, expiry)`,
`fund(id, amount)`, `approveAndPay(id, amount, hash)` for escalations, and `revoke(id)` to pull unspent funds and lock the agent out.
The reference FastAPI service + Telegram bot in the main repo does this with one tap.
