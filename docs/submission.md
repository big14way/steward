# Tameion submission answers (paste-ready)

Form: https://forms.gle/BBWrdfuircrKiG2i6 · deadline Oct 10, 11:59 PM ET (resubmitting is allowed; submit v1 Oct 8).
Numbers are from `GET /stats` on **Sep 30, 2026 (evening)**; refresh them from the README stats row before each submission.

## Links

- **Project:** STEWARD: let your AI agent pay people, within limits it can't cross.
- **GitHub:** https://github.com/big14way/steward
- **Live app:** https://steward-arc.vercel.app (judges: *Try the live demo*)
- **Video (under 3 min):** https://youtu.be/2pqqzNq5C8o
- **SDK:** npm `steward-arc-sdk` · PyPI `steward-sdk`

## One-liner

STEWARD gives an AI agent a per-contractor budget that a smart contract on Arc enforces, records why every payment happened on-chain,
and asks a human only when a request is outside policy. USDC on Arc, signed by Circle wallets; contractors need no account, wallet or gas.

## Traction

**Businesses onboarded.** 2 paying businesses on-chain. **webservice co**, a real business trying STEWARD, signed up through self-serve on Sep 30,
funded its own Circle wallet, added its contractor Lela (a Circle wallet was created for her) and paid her 10 USDC for a logo: the agent
decided within policy, Claude wrote the reason, and the payment is on Arc (tx 0x0a7d3a48…a2687). **Acme Studio**, our launch workspace,
pays 8 more contractors, including one real freelancer paid to their own wallet.

**Value moved.** 21.15 USDC paid to contractors across 20 paid requests; 22 agent decisions recorded on-chain (12 paid by the agent within
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

## Oct 14 resubmission — the form's questions in order

Fresh numbers from `GET /stats` on Oct 14, 2026: testnet 9 allowances, 2 payers, 9 contractors, 21.15 USDC paid, 22 decisions
(12 PAY, 8 ESCALATE, 2 SCREEN_FAIL), owner agreed 80%, on time 100%, 2.00 USDC swept to USYC. Mainnet 1 allowance, 2 decisions, 0.95 USDC paid.
The official deadline was Oct 10, 11:59 PM ET; the form still accepted responses on Oct 14, so this edit may count as late.

- **Email:** idolorgodswilleseteru@gmail.com
- **Project Name:** STEWARD
- **GitHub handle:** big14way
- **Discord handle:** godswill.ox
- **Telegram handle:** @b14wayfx
- **X profile:** https://x.com/big14teru
- **Number of team members:** 1 (Solo) · **Names:** Godswill Idolor
- **Previous Canteen x Arc hackathons:** None
- **Continued project?** No. STEWARD started on Sep 28, 2026 for Tameion (first commit 3fb0dc5). After the event, on Oct 14, I deployed
  its core contracts to Arc mainnet and submitted it to Arc Microgrants on DoraHacks; that submission is under review and nothing has been
  received. No other Circle or Canteen programs, grants or awards.
- **What you built / users in the last two weeks:** In two weeks STEWARD went from an empty repo to a hosted product two businesses use on
  Arc Testnet. A business signs up, gets its own Circle owner wallet, adds contractors in one dialog (STEWARD creates a Circle wallet for
  each and puts a capped allowance on Arc), and sends each contractor a private link. The agent reads requests, applies screening, evidence,
  cap, budget and liquidity rules, has Claude write the reason, hashes the decision onto AuditLog and pays or escalates. webservice co signed
  up on its own on Sep 30 and paid its contractor Lela 10 USDC through the agent; Acme Studio pays 8 more, including a real freelancer paid
  to their own wallet. That matters because the whole point is a business letting an agent pay real people without handing it the wallet.
- **Problem statement:** A business that lets an AI agent pay people has two bad options: hand it an uncapped wallet that one prompt
  injection or spoofed email can drain, or approve every payment by hand so contractors wait weeks. Circle's developer wallets have no
  policy engine, and agent-wallet policies are per wallet, mainnet only and off-chain. It started with my sister, a designer in Lagos: her
  invoice waited 40 days, then a scammer emailed new bank details in her name and the client paid him.
- **Project description:** STEWARD gives an agent one allowance per payee, enforced by a contract on Arc: a cap per payment, a cap per period,
  an expiry and a kill switch, with the payee fixed on-chain. Rules pick PAY, PARTIAL, HOLD, ESCALATE or SCREEN_FAIL; Claude writes the reason
  and is never allowed to set an amount; the canonical decision is hashed onto AuditLog before money moves, and one hash pays exactly once
  whether the agent or the owner sends it. Out-of-policy requests go to an approvals inbox (and Telegram) for one-click approval from the
  owner's Circle wallet. Tech: Solidity on Arc with Foundry (AllowanceManager, AuditLog, YieldSweeper, 46 tests), a Python agent (20 tests),
  FastAPI, Next.js 16, and a TypeScript/Python SDK. Circle: Developer-Controlled Wallets for every signer, EIP-712 signing, CCTP V2 payouts to
  Base Sepolia, Gas Station, signed webhooks, Circle Contracts, real USYC through the Teller.
- **Traction:** 2 paying businesses on-chain, 9 contractors with allowances, 21.15 USDC paid across 20 requests, 22 decisions on Arc
  (12 paid within policy, 8 sent to the owner, 2 blocked), owner agreed with 80% of escalations, 100% paid within 24 hours, first CCTP payout
  landed on Base 23 s after approval. Since Oct 14 the core also runs on Arc mainnet (steward-mainnet.vercel.app) with a paid request and an
  owner-approved escalation on the record. SDK published on npm and PyPI.
- **Source code:** https://github.com/big14way/steward
- **Diff link (new project, full history up to the deadline):** https://github.com/big14way/steward/compare/3fb0dc5...c73efb5
- **Project live:** https://steward-arc.vercel.app (testnet, "Try the live demo") · mainnet https://steward-mainnet.vercel.app
- **Video:** https://youtu.be/2pqqzNq5C8o
- **Arc OSS:** Yes. Why: on-chain per-payee spending allowances with a period budget, expiry and kill switch that any agent can use through
  a 10-line SDK; a decision hash that pays exactly once across agent and owner paths; an AuditLog pattern for replayable agent decisions;
  working Circle Developer-Controlled Wallet flows for contract execution and EIP-712 signing; CCTP V2 with Gas Station; real USYC Teller
  integration. circlefin/arc-* samples show escrow and single transfers; STEWARD adds the policy layer between an agent and the money.
- **Circle / Arc feedback:** Worked well: Developer-Controlled Wallets plus contract execution made "no key on the server" easy; CCTP V2 with
  the forwarding hook moved USDC from Ethereum to Arc mainnet in 10 seconds; USDC as gas keeps costs predictable. Could improve: getting
  USDC onto Arc mainnet from exchanges (Bybit showed no Arc network for me); the Arc→Ethereum forwarding fee (~1.5 USDC) is high for small
  refunds; the public explorer's Cloudflare challenge blocks `forge verify-contract`; Circle mainnet wallet access is a separate onboarding,
  so a hackathon project can't move its Circle-wallet setup to mainnet quickly; `importContract` rejects a `description`.
- **20-minute call:** not ticked (as on Sep 30)
- **General feedback:** The doc mirror and the Canteen CLI were the most useful part; clearer guidance on what judges see when a build has
  both a testnet and a mainnet deployment would help.
