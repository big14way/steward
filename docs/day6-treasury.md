# Day 6 — idle USDC → vault (USYC or disclosed MockUSYC), proven locally (Sep 28, 2026)

USYC on Arc Testnet needs allowlisting via a Circle Support ticket (24–48 h). Until that lands, `YieldSweeper` is deployed against
`MockUSYC`, an ERC-4626 vault with the same `deposit` / `redeem` shape, and this is disclosed in the README. Swapping in the real
Teller means deploying a thin 4626-shaped adapter and passing its address as `USYC_VAULT` with `USE_MOCK_USYC=false` (Appendix C).

## Contract tests (`contracts/test/YieldSweeper.t.sol`, 11 tests; suite total 44)

sweep deposits exactly `balance − floor − obligations` · owner or agent only · `BelowFloor` when nothing is idle · redeem returns
assets and captures accrued yield (10 % donation → +10 %) · `setFloor` / `withdrawToOwner` owner-only · fuzz: the floor is never broken.

## Agent loop (`agent/treasury.py`, run every `TREASURY_EVERY` = 6 h, or once with `python treasury.py`)

```
obligations = pending milestones + open escalation remainders (SCREEN_FAIL excluded)
idle        = sweeper USDC balance − reserveFloor − obligations
idle ≥ SWEEP_MIN (50 USDC)          → sweep(obligations)      → AuditLog.record(TREASURY_ID, hash, SWEEP, idle)
balance < floor + obligations, shares → redeem(shares needed) → AuditLog.record(TREASURY_ID, hash, REDEEM, got)
```
`TREASURY_ID = 2²⁵⁶ − 1` is the AuditLog allowance-id sentinel for treasury events. The hash is keccak256 of a canonical JSON
(`{kind, balance, floor, obligations, shares_before, assets, block}`) stored with the event, so treasury moves replay like decisions.

## Local run (arc-anvil, MockUSYC)

| Step | Result |
|---|---|
| `POST /treasury/fund` 1,000 USDC from the owner (local signer) | sweeper balance 1,000, floor 100 |
| `python treasury.py` with 140 USDC of open obligations | **SWEEP 760** → 760,000,000 shares; `record()` tx logged |
| new 600 USDC milestone → agent ESCALATE (over per-tx cap) → obligations 740 | balance 240 < 840 needed |
| `python treasury.py` | **REDEEM 600** (600,000,001 shares, +1 for rounding); balance 840, 160 left in the vault |
| `GET /stats` | `usyc_swept` 760.0 · `GET /treasury` lists both events with tx + record tx; the dashboard home shows liquid / in-vault / last events |

## Owner surface

`POST /treasury/fund {owner_secret, amount}` moves USDC from the owner wallet into the sweeper (Circle wallet `transfer`, or local key).
`GET /treasury` returns balance, floor, shares, position and the event log.
