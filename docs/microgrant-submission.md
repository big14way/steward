# Arc Microgrants submission (DoraHacks, Oct 14, 2026) — paste-ready

**Project name:** STEWARD

**One line:** Let your AI agent pay people, within limits it can't cross.

**Live on Arc mainnet:** https://steward-mainnet.vercel.app
**Repo:** https://github.com/big14way/steward (MIT)
**Builder:** GitHub https://github.com/big14way · X https://x.com/big14teru
**Wallet for the grant (USDC on Arc):** 0x526dd81859c728963f1a6007110f24014F520FE2

## What it does

STEWARD gives an AI agent a per-contractor budget that a smart contract on Arc enforces: a cap per payment, a cap per period, an expiry
and a kill switch, with the payee fixed on-chain so no email can redirect a payout. Rules decide the outcome (PAY / PARTIAL / HOLD /
ESCALATE / SCREEN_FAIL); a model only writes the reason, never the amount; the canonical decision is hashed onto an on-chain AuditLog
before any USDC moves, and one hash can pay exactly once. In-policy requests are paid in under a minute. Anything policy blocks goes to
the owner with the reason, and one click pays it. Contractors need no account, wallet software or gas.

## What it uses Arc for

Everything that matters is on Arc: `AllowanceManager` holds the budgets and pays USDC (the ERC-20 interface of Arc's native USDC at
`0x3600…0000`), `AuditLog` records every decision before money moves, and gas is paid in USDC so a business never holds a second token.
Both contracts are live on Arc mainnet at `0x3AAfC635a1D1391c9FD8b5B9d8A518Fe980cb7E6` and `0x89264D27AFbCb2Ac90b8a3802340C26Ea1326866`
(deploy txs in the README). The first mainnet decisions are on the record: a 0.25 USDC request paid within policy
(record 0x7e94ed20…a540, pay 0x23f89ae7…124f) and a 0.70 USDC request escalated over the per-payment cap (0x35ced1df…41c9) and approved by the owner with one click (0xc9624888…0f1d),
each with a reason written by the model and hashed before any transfer. The mainnet USDC came in over CCTP V2 with Circle's forwarding hook. On testnet the same code also runs with
Circle Developer-Controlled Wallets for every signer, CCTP V2 payouts to Base, Gas Station, signed webhooks and real USYC; those move
to mainnet as Circle grants mainnet wallet access.

## Where it came from

Built for the Tameion hackathon (Sep 28 – Oct 10, 2026). On testnet: two businesses, nine contractors with on-chain allowances,
22 agent decisions recorded on Arc, 21 USDC paid, one business that signed up on its own and paid its contractor without us touching anything.
Mainnet went live Oct 14 with the first real decisions on the record. SDK on npm (`steward-arc-sdk`) and PyPI (`steward-sdk`).

## What's next

Circle mainnet wallets for every signer, the yield reserve on real USYC, more businesses through self-serve, team roles and two-factor sign-in.
