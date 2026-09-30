# Day 9 — steward-sdk (TypeScript + Python), built and smoke-tested Sep 28, 2026

`packages/steward-sdk` — one class, `Steward`, same public surface in both languages:

```
allowance(id)                           → the on-chain Allowance struct
decide({allowanceId, amount, memo, inputs, screenOk?, evidence?, reserveFloor?, obligations?, reason?})
   rules → canonical record → keccak256 → AuditLog.record() → pay() | escalate()   (HOLD is recorded too)
```

Guarantees the SDK gives an integrator's agent for free: the contract caps every `pay()`; every decision (including HOLD) is on the
AuditLog keyed by the hash of a canonical JSON you get back; a hash pays once even on retry; a PARTIAL's remainder is escalated under
`keccak256("STEWARD/remainder" ‖ hash)`; Arc's 20 gwei floor is applied to every write.

## Cross-language determinism

`test/hash.test.mjs` hashes a fixed record (with unicode and nested arrays) in TypeScript and asserts equality with the Python
package's `decision_hash` / `remainder_hash` for the same record. Sorted keys + no whitespace + UTF-8 (no `\u` escaping) on both sides.

## Local smoke (arc-anvil, allowance #0, agent = anvil #2)

| SDK | Calls | Result |
|---|---|---|
| Python | `decide(50 USDC)` · `decide(350 USDC)` · `decide(10 USDC, evidence=False)` | PAY (record + pay tx, `usedDecision[hash]` true, hash re-derives from `record`) · ESCALATE (R3) · HOLD (record only) |
| TypeScript | `decide(30 USDC)` · `decide(150 USDC, floor 100, obligations 300)` | PAY · PARTIAL (pays the liquid part, escalates the rest under the remainder hash) |

## Publishing (builder, needs npm + PyPI accounts)

```bash
cd packages/steward-sdk && npm run build && npm test && npm publish --access public
cd python && python -m build && python -m twine upload dist/*
```
Until published, integrators can `npm i github:big14way/steward#main --workspace packages/steward-sdk` or `pip install "git+https://github.com/big14way/steward#subdirectory=packages/steward-sdk/python"`.

## Discord post (Day 9)

> If your Tameion agent pays anyone in USDC, put STEWARD in front of it: one contract call gives you per-payee caps + period limits +
> expiry the agent can't exceed, an on-chain decision log, and an escalation path. `npm i @big14way/steward-sdk` / `pip install steward-sdk`, 10 lines.
> Repo: github.com/big14way/steward — reply here and I'll add you to the integrators list on the README.
