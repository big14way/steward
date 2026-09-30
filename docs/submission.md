# Tameion submission answers (paste-ready)

Form: https://forms.gle/BBWrdfuircrKiG2i6 · deadline Oct 10, 11:59 PM ET (resubmitting is allowed; submit v1 Oct 8).
Numbers are from `GET /stats` on **Sep 30, 2026 (evening)**; refresh them from the README stats row before each submission.

## Links

- **Project:** STEWARD: let your AI agent pay people, within limits it can't cross.
- **GitHub:** https://github.com/big14way/steward
- **Live app:** https://steward-arc.vercel.app (judges: *Try the live demo*)
- **Video (under 3 min):** _add the YouTube/Loom link_
- **SDK:** npm `steward-arc-sdk` · PyPI `steward-sdk`

## One-liner

STEWARD gives an AI agent a per-contractor budget that a smart contract on Arc enforces, records why every payment happened on-chain,
and asks a human only when a request is outside policy. USDC on Arc, signed by Circle wallets; contractors need no account, wallet or gas.

## Traction

**Businesses onboarded.** 1 paying business so far (Acme Studio, our launch workspace) with 8 contractors, each with their own on-chain
budget and a Circle wallet created for them, including one real freelancer paid to their own wallet. Self-serve sign-up is live, so more businesses can onboard: _(add each real business: name, contractors, payments)._

**Value moved.** 11.15 USDC paid to contractors across 19 paid requests; 21 agent decisions recorded on-chain (11 paid by the agent within
policy, 8 sent to the owner, 2 blocked screening failures); 88.9% of reviewed escalations approved by the owner; 100% paid within 24 hours;
first cross-chain payout (CCTP V2, Arc to Base Sepolia) delivered 23 seconds after approval; idle owner USDC moved into real USYC and back.

**Problem solved.** Businesses that let an agent pay people choose between handing it an uncapped wallet or approving every payment by
hand. Circle's developer wallets have no policy engine, and agent-wallet policies are per wallet, mainnet only and off-chain. STEWARD
enforces per-payee caps, period limits, expiry and a kill switch on-chain, fixes the payee so no email can redirect a payout, writes a
replayable reason for every decision, and escalates only what policy blocks. For contractors (for example Nigerian freelancers paid by
clients abroad) it turns "net-30 and hope" into being paid in minutes.

**Will you keep building?** Yes: self-serve workspaces for more businesses, mainnet, team roles and two-factor sign-in, and SDK adoption
by other agents.

## Judging criteria, briefly

- **Agentic sophistication (30%).** The agent decides, not just executes: screening, evidence, per-payment cap, period budget and
  liquidity rules pick PAY / PARTIAL / HOLD / ESCALATE / SCREEN_FAIL; Claude (Sonnet 5.5) writes the reason, schema-validated and never
  allowed to set an amount; the canonical decision is hashed onto AuditLog before money moves; partial payments escalate only the remainder;
  cross-chain requests are routed to the owner; idle cash is swept to yield and redeemed ahead of obligations.
- **Traction (30%).** See above; live numbers in the README table (refreshed daily by a GitHub Action).
- **Circle tools (20%).** Developer-Controlled Wallets sign every transaction (owner, agent, each contractor); EIP-712 signing via Circle;
  CCTP V2 payouts to Base Sepolia; Gas Station sponsors the Base relayer; signed notification webhooks; Circle Contracts; real USYC through
  the Teller (allowlisted by Circle).
- **Innovation (20%).** One decision hash pays exactly once, whoever sends it (agent `pay()` or owner `approveAndPay()`), with a derived
  hash for partial remainders; per-payee on-chain allowances usable on testnet today; an attack that failed on three layers (model schema,
  rules, Arc's own blocklist). Research notes in `docs/product-flow.md`.
