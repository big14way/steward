# Testnet go-live — Sep 29, 2026

Everything below happened on Arc Testnet (chain 5042002) with **no private key in the agent or API**: owner and agent writes go through
Circle Developer-Controlled wallets (`createContractExecutionTransaction`), and the demo contractor wallet signs its milestones with
Circle's `SigningApi.sign_typed_data`. Only the one-off deployer used a local key.

## Sequence

| Step | Who signed | Tx / id |
|---|---|---|
| Deploy AllowanceManager, AuditLog, MockUSYC, YieldSweeper | deployer (Foundry, 25 gwei) | see README table |
| Import all four into Circle Contracts | Circle API | ids `01a0ea95-…` in `CIRCLE_INTEGRATION.md` |
| Fund owner (15 USDC) and agent (2.5 USDC) wallets | deployer → native USDC transfer | `0xe15eae57…`, `0xc36e8178…` |
| Allowance #0 (judge demo, payee = Circle contractor wallet): cap 5 / per-tx 2 / weekly, fund 4 | **Circle owner wallet** `create` + `approve` + `fund` | `0x36359247…9f59`, `0xef26131e…d2cc` |
| Allowance #1 (freelancer `0x3C34…4C51`): cap 8 / per-tx 3 / weekly, fund 6 | Circle owner wallet | `0x0fc9dccf…8a90`, `0xe7240dc6…aaa1` |
| Milestone "logo v2" 1.50 USDC | **Circle contractor wallet** EIP-712 (`sign_typed_data`) → API recovered the payee ✓ | milestone `2368dbd2-…` |
| Agent decision → `ESCALATE` (R4_no_room: reserve floor was still 100 USDC vs a 4 USDC allowance) → `record()` | **Circle agent wallet** | record `0x1bde29a6…ebd4` |
| Owner approves the 1.50 USDC escalation → `approveAndPay()` | Circle owner wallet | `0x71808a88…5791` |
| Reserve floor scaled to 1 USDC for faucet-sized budgets; milestone "brand guidelines v1" 0.80 USDC | Circle contractor wallet | milestone `804560a6-…` |
| Agent decision → **`PAY`** (R5) → `record()` + `pay()` | Circle agent wallet | record `0x04a63c28…01fb`, **pay `0xea63a3b0…de61`** |
| `setFloor` from the Circle owner wallet **failed** (`ESTIMATION_ERROR`): v1 sweeper's owner was the deployer. Fixed the contract (explicit `owner` param + `setAgent` / `transferOwnership`, 46 tests), redeployed as [`0xA499F1053c66eCE47B49Fb0bA87228Cc729fC9D1`](https://explorer.testnet.arc.io/address/0xA499F1053c66eCE47B49Fb0bA87228Cc729fC9D1) with owner = Circle owner wallet and floor 1 USDC; recovered the 3 USDC from v1 and funded v2 via ERC-20 `transfer` | deployer | `0x79854caa…a890` |
| Treasury cycle → `sweep()` 2.00 USDC into MockUSYC + `record(SWEEP)` | **Circle agent wallet** | sweep `0x2d3cf2c8…a0b9`, record `0x118dad18…baaa` |

Result: payee balance 2.30 USDC; allowance #0 funded 1.70, spent 0.80 this period; `GET /stats` → 2 decisions (1 PAY, 1 ESCALATE),
2.30 USDC paid, human agreed 100 %, on time 100 %.

## Things learned going live

- The agent's `SIGNER=circle` path imported `api/circle_client.py` by prepending `api/` to `sys.path`, which made the agent's `db` module
  resolve to the API's SQLite `db.py`. Fixed by loading the client with `importlib` from its file path.
- The agent venv needs `circle-developer-controlled-wallets` too (added to `agent/requirements.txt`).
- `RESERVE_FLOOR` (agent) and `YieldSweeper.reserveFloor` (chain) must match the budget scale: 100 USDC is right for the spec's 500 USDC
  allowances, 1 USDC for faucet-sized ones. Both are configurable without redeploying (`setFloor` is owner-only).
- Circle `importContract` 400s when a `description` is sent; `name` + `address` + `blockchain` + `idempotencyKey` works.
- Blockscout rate-limits the verify pre-check; `--skip-is-verified-check` helps but the public explorer still throttles bursts.
- Circle contract-execution txs take roughly 10–30 s to reach `COMPLETE`; the agent's decide loop is fine with that because every
  step is idempotent (the decision hash pays once).

## Freelancer onboarding (allowance #1)

The freelancer signs on their own machine so their key never leaves it:

```bash
pip install eth-account httpx
python api/scripts/submit_milestone.py --allowance 1 --title "…" --amount 2.5 --evidence https://… \
  --key 0x<their key> --am 0x3AAfC635a1D1391c9FD8b5B9d8A518Fe980cb7E6 --sign-only > milestone.json
```
They send `milestone.json` to the owner, who posts it: `curl -X POST <API>/milestones -H 'content-type: application/json' -d @milestone.json`.
Or, once the API and dashboard are public, they use `/contractor` with MetaMask on Arc Testnet and it is one click.
