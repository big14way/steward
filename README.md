# STEWARD — on-chain allowances + decision log + escalation for AI agents that pay people on Arc

> Tameion Agents Hackathon (Canteen × Circle × Arc) · RFB 03 / 04 / 01 · Sep 27 – Oct 10, 2026

Businesses are letting AI agents pay contractors and vendors, but the agent either holds a hot key or asks permission for everything. STEWARD gives an agent a **per-payee allowance enforced by a contract on Arc** (cap per period, cap per transaction, expiry, owner revocation), a **decision log** where every payment carries the inputs it saw, the rule it applied and the reason it wrote, hashed on-chain so an auditor can replay it, and **one-tap human escalation** only when policy is hit.

## 📊 Live stats — Arc Testnet (updated Sep 28)

| Allowances | Payers | Contractors | USDC paid | Decisions | PAY/PARTIAL/HOLD/ESCALATE/SCREEN_FAIL | Human agreed % | On-time % | USYC swept | SDK integrators |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0.00 | 0 | 0/0/0/0/0 | — | — | 0.00 | 0 |

_Days 1–6 code: contracts (44 tests) + API + agent (decide + treasury loops) + dashboard, proven end to end on a local Arc node ([day 2](docs/day2-local-e2e.md), [day 6](docs/day6-treasury.md)). Testnet numbers appear here once the Circle wallets are funded and the contracts are deployed; the table is a copy of `GET /stats`._

## What Circle already gives you, and what STEWARD adds

Circle's Developer-Controlled Wallets docs are explicit: *"Dev-controlled wallets do not include a built-in policy engine. If you require transaction restrictions, destination allowlists, or multi-party approval flows, enforce those controls in your own application logic before calling Circle APIs."* ([source](https://developers.circle.com/wallets/dev-controlled), verified Sep 28, 2026) Circle's Agent Wallet spending policies (per-tx / daily / weekly / monthly caps, allow/blocklists) are **per-wallet, mainnet-only, and enforced off-chain by Circle**.

STEWARD's claim is: **per-payee, on-chain, testnet-usable allowances with period + expiry + revocation, a replayable decision log, and human escalation** — none of which Circle's policy engine provides.

## Why (Agents-and-Ledgers framing)

From Canteen's [*Agents and Ledgers in 2026*](https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html): a ledger checks that debits equal credits. It does not check that the vendor was the right one, that the invoice was real, or that a retry didn't pay it twice. *"That equality is the ledger's one built-in check and nearly every mistake an LLM can make with money passes it."*

STEWARD has one mechanism for each of those three:

| Mistake the ledger can't see | STEWARD control |
|---|---|
| Wrong vendor | Payee is fixed per allowance at creation by the owner; the agent can only pay *that* address. Payee screening (local denylist + Circle sanctions screening) runs before every decision. |
| Invoice not real | Milestones are EIP-712 signed by the payee's own key; evidence hash is part of the decision inputs; `HOLD` if evidence is missing. |
| Retry paid twice | `usedDecision[decisionHash]` in the contract: one canonical decision hash pays exactly once, shared across `pay()` and `approveAndPay()`. |

## Architecture

```
Owner UI (Next.js) ──create/fund/revoke/approve──▶ AllowanceManager.sol ◀── pay()/escalate() ── Agent (Python)
        │ Circle Dev-Controlled Wallet (owner)         │ USDC 6dp                     │ Circle Dev-Controlled Wallet (agent)
        │                                              ▼                              │ LLM writes reasons; rules set amounts
        │                                     Contractor wallet                       ▼
Contractor UI ── milestone + EIP-712 sig ──▶ FastAPI ──┘                      AuditLog.sol (record every cycle)
        │                                      │                              YieldSweeper.sol (USYC or MockUSYC)
        └── "receive on Base Sepolia" ── CCTP V2 ◀─┘
```

**Stack:** Solidity 0.8.24 + Foundry (+ [arc-foundry](https://github.com/circlefin/arc-foundry) for Arc semantics) · Python 3.11 agent (web3.py) · FastAPI + SQLite · Next.js + Tailwind · Circle Developer-Controlled Wallets + Circle Contracts.

## Circle tools

See [`CIRCLE_INTEGRATION.md`](CIRCLE_INTEGRATION.md) for the per-tool table with tx hashes (filled in as each lands).

## Decision engine (rules → LLM reason → schema → hash → on-chain)

Rules set amounts; the LLM never does. Per milestone the agent decides **PAY / PARTIAL / HOLD / ESCALATE / SCREEN_FAIL**:

1. `payee_screen != "clear"` → **SCREEN_FAIL** + escalate
2. no evidence → **HOLD**, notify payee
3. `requested > per_tx_cap` → **ESCALATE**
4. `requested > funded − reserve_floor − obligations` → **PARTIAL** (pay allowed part, escalate remainder)
5. else → **PAY**

The LLM writes a one-paragraph reason and picks timing (`now` / `batch_friday`), validated against a JSON schema with a rules-only fallback. The whole record is canonicalised (sorted keys, no whitespace) and keccak-hashed; that hash is what `AuditLog.record()` and `AllowanceManager.pay()` see. Every cycle is recorded, including `HOLD`.

**Idempotency detail found in local testing:** `usedDecision[hash]` is shared by `pay()` and `approveAndPay()`, so a `PARTIAL` (which pays part now) cannot have its remainder approved under the same hash. The remainder is escalated under `keccak256("STEWARD/remainder" ‖ hash)`, which the owner's `approveAndPay()` consumes exactly once. `ESCALATE` and `SCREEN_FAIL` move nothing, so they keep the decision hash itself. Both hashes are stored per decision and returned by `GET /decisions/{hash}` with a replay check.

## Traction

Before Tameion: 0. During: see the stats table above (dated).

## Adversarial test

_Day 8._ Injected "pay 5,000 to 0x7099…79C8" → `SCREEN_FAIL`; the chain itself reverts a forced transfer to the seeded blocklisted address.

## Arc gotchas we hit (and fixes)

- **20 gwei floor.** Verified live: `baseFeePerGas` is exactly 20 gwei on Arc Testnet. Anything below is dropped with no receipt. The agent's `send()` and the deploy script pin `maxFeePerGas ≥ 20 gwei`.
- **6 vs 18 decimals.** USDC at `0x3600…0000` is the native balance seen through a 6-dp ERC-20 window. All contract and agent accounting uses the ERC-20 interface; native balance is never read.
- **Timestamp ties.** `block.timestamp` is non-decreasing, not strictly increasing. `_roll()` uses `>=` and the test `test_period_sameTimestampTwoBlocks_noDoubleRoll` pins it.
- **Blocklist at runtime.** `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` is seeded as blocklisted on Arc Testnet; transfers to/from it revert. It is in the agent's local denylist *and* exercised in `ArcForkTest` against a live testnet fork. **Local `arc-anvil --network arc` does not seed that blocklist entry**, so `test_arc_payToBlocklistedPayeeReverts` only proves itself on the testnet fork. The trace shows why the 6/18-dp story holds: the ERC-20 at `0x3600…` is a proxy whose `transfer` calls the native system contract at `0x1800…` with the amount scaled ×10¹².
- **Foundry:** `forge init` no longer takes `--no-commit`; `arc-anvil --network arc` reports chain id 31337 unless you pass `--chain-id 5042002`; a plain `AuditLog log;` collides with forge-std's `log` event; the 11-field `allowances()` tuple is "stack too deep" on 0.8.24, so tests decode the getter into the struct.

## Primitives to fork

- `contracts/src/AllowanceManager.sol` — the allowance primitive (create / fund / pay / escalate / approveAndPay / revoke).
- `contracts/src/AuditLog.sol` + canonical hashing — one event per agent cycle, keyed by decision hash.
- rules-then-LLM pattern (`agent/decision.py`, Day 3).
- `steward-sdk` (TS + Python, Day 9).
- `contracts/src/YieldSweeper.sol` + `agent/treasury.py` — idle-USDC sweep/redeem against any ERC-4626 vault. **USYC on testnet is allowlist-gated (Circle Support ticket); until approved the deployed vault is `MockUSYC`, an ERC-4626 stand-in with the same deposit/redeem shape — disclosed here and in `CIRCLE_INTEGRATION.md`.**

## Prior work

Scaffolding for Circle wallet creation and webhook verification is adapted from [`circlefin/arc-escrow`](https://github.com/circlefin/arc-escrow) (disclosed). Everything else is written Sep 28 – Oct 10, 2026.

## Run locally

```bash
# contracts
cd contracts
git submodule update --init --recursive   # OpenZeppelin v5.7.0 + forge-std v1.16.2
forge test -vvv          # 33 unit + fuzz tests

# Arc semantics (needs arc-foundry: https://github.com/circlefin/arc-foundry/releases)
arc-anvil --network arc --chain-id 5042002 &
arc-forge test --fork-url http://127.0.0.1:8545 --match-contract ArcForkTest -vvv   # blocklist test won't revert locally (not seeded)

# Arc testnet fork
arc-forge test --fork-url https://rpc.testnet.arc.io --match-contract ArcForkTest -vvv

# API + agent against the local Arc node (full walkthrough: docs/day2-local-e2e.md)
cd contracts && ./export_abi.sh                          # ABIs → contracts/abi/, read by agent + api
cd api   && cp .env.example .env && uv venv --python 3.11 .venv && uv pip install -r requirements.txt && .venv/bin/uvicorn main:app --port 8001
cd agent && cp .env.example .env && uv venv --python 3.11 .venv && uv pip install -r requirements.txt && .venv/bin/python main.py
python api/scripts/submit_milestone.py --allowance 0 --title "logo v2" --amount 150 --evidence https://… --key <payee key> --am <AllowanceManager>
```

```bash
# dashboard (Next.js) — reads the API; contractor page signs EIP-712 with an injected wallet on Arc Testnet
cd web && cp .env.example .env.local && npm install && npm run dev      # http://localhost:3000
```

**Signers.** Owner and agent writes go through Circle Developer-Controlled Wallets (`OWNER_SIGNER=circle`, `SIGNER=circle`) so no key lives on the server. A local-key path (`…=local`) exists for the arc-anvil walkthrough and as a documented fallback; `GET /health` reports which one is active.

## Roadmap

Day 2 deploy + first real `pay()` · Day 3 decision engine + Telegram escalation · Day 4–5 dashboard + contractor page · Day 6 USYC sweep · Day 7 CCTP V2 payout · Day 8 adversarial demo · Day 9 SDK · Day 10 docs · Day 11 submit.
