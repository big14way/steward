# Product flow (Sep 29, 2026) — what the owner and the contractor actually do

The first UI exposed the primitives (allowances, EIP-712 milestones, decision hashes). That is the right *engine* but the wrong
*surface*: an owner should not paste wallet addresses and secrets into forms, and a freelancer should not need MetaMask on a
testnet to ask for money. This page describes the redesigned flow and the references it is modelled on.

## References checked

| Product | What we took from it |
|---|---|
| **Safe{Wallet} Spending Limits** (help.safe.global) | The primitive is identical: beneficiary + token + amount + reset period (one-time / daily / weekly / monthly); the beneficiary spends within the limit without other signers; limits are listed with remaining/reset and a remove action. Our `AllowanceManager` = a spending limit with a per-payment cap and an expiry on top. |
| **Coinbase / Base Spend Permissions** (docs.cdp.coinbase.com) | Same shape again: spender, token, allowance per period, start/end; granted once, spent without further prompts, revocable by either side. Confirms the "budget the agent can't exceed" framing and the per-period reset. |
| **Circle `arc-escrow` sample** (Circle's own Arc reference app) | Every user gets a **Circle Developer-Controlled wallet at sign-up**, so nobody installs a browser wallet; a dashboard card shows account balance with a "Request USDC" faucet button; agreements are a table with a status pill (INITIATED / OPEN / LOCKED / CLOSED) and role-specific buttons ("Deposit funds", "Submit work", "Issue refund"); an AI validation step returns "Work approved" / "Work validation failed" dialogs. We adopted: wallet-on-behalf-of-contractor, status pills, role-specific actions, plain-English outcomes. |
| **Upwork fixed-price milestones** | Client funds a milestone up front; the freelancer "submits work" and requests payment; the client approves or requests changes, with an automatic approval window. Our agent is the "auto-approve within policy" step; the owner is the exception path. |
| **ERC-8183 on Arc** (Arc tutorial) | Job lifecycle Created → Funded → Submitted → Completed/Rejected with client / provider / evaluator roles. Our timeline mirrors it: Submitted → Agent review → Paid / Waiting for owner / On hold / Blocked. |
| 2026 agent-spend-control products (Ramp, Crossmint agent wallets, FluxA, Fystack write-ups) | Consensus wording: *spend caps, approval gates, audit logs*; "a decline is not a decision" → we always write a reason and record every outcome, including holds. |

## The redesigned flow

### Owner (Acme Studio)
1. **Sign in once** (top-right chip) with the owner secret. It stays in the browser; no more secrets in forms.
2. **Contractors → Add contractor**: name, contact, optional wallet address, max per payment, max per period, period, fund now.
   - No wallet address → STEWARD creates a Circle Developer-Controlled wallet for them (as arc-escrow does) and makes it the payee.
   - Creates the on-chain allowance from the owner's Circle wallet and funds it.
   - Returns a **private link** (`/c/<token>`) to send the contractor. That link is their whole experience.
3. **Contractors** list: budget policy in words ("up to 3 USDC per payment · 8 USDC per week"), spent-this-period bar, funded, open/paid requests, Copy link, Top up, History, End budget (revoke = refund + lock).
4. **Approvals**: the inbox of requests the agent would not pay: contractor name, title, amount, plain-English rule ("Above the per-payment cap"), evidence link, Approve & pay / Decline. Screening failures show as Blocked with no approve button.
5. **Activity**: the audit log in plain English with the canonical record and every tx link.
6. **Treasury**: liquid reserve, in-vault, floor, sweeps/redeems; "Move USDC into the reserve".

### Contractor
1. Opens the private link. Sees who pays them, their max per payment, what is left this period and when it resets, and the funded balance.
2. **Request a payment**: what they delivered, a link to the work, the amount. Inline hints warn when an amount is above the per-payment cap or above what is left (so they know the owner will be asked).
3. Requests list with a timeline: Submitted → Agent review (rule + reason, on-chain record) → Paid (tx) / Waiting for the owner / On hold: add evidence / Blocked.
4. No wallet, no sign-up. If they brought their own address the request is authenticated by link possession; if STEWARD made their Circle wallet, the API signs the EIP-712 milestone with it (`SigningApi.sign_typed_data`), so the on-chain guarantee is unchanged. Contractors who prefer their own wallet can still use `/contractor` (MetaMask on Arc Testnet).

### Judge
Banner → **Open approvals**. The judge secret shown in the banner is scoped to approve / reject only.

## What did not change
The contract, the rules engine, the canonical hash, the escalation model, and the SDK are untouched. This was a surface change: `POST /contractors`, `GET /contractors`, `POST /contractors/{id}/fund|revoke`, `GET /c/{token}`, `POST /c/{token}/requests`, and the `milestones.auth` column (`wallet` | `circle` | `link`).

## Verified on testnet (Sep 29, 2026)
- Freelancer's existing budget (#1) attached to a contractor record → link issued.
- "Demo Designer" added with no wallet → Circle wallet `0x8EF2…E66F` created, budget #2 created and funded from the owner's Circle wallet, link issued.
- Request from the link (0.3 USDC) → signed by the contractor's Circle wallet → agent `ESCALATE` (reserve floor still 1 USDC vs a 0.5 budget; floor set to 0 for faucet-sized budgets afterwards).
- Second request (0.2 USDC) → agent `PAY` from the Circle agent wallet; the contractor's Circle wallet balance rose accordingly; the portal timeline shows Submitted → Agent review → Paid with tx links.

## Real-browser verification (Sep 29, 2026, Brave via Claude in Chrome)

Owner: signed in → *Contractors → Add contractor* → "Test Writer" (no wallet) → budget 0.50 per payment / 1.00 per week / fund 0.30 →
Confirm summary → **a Circle wallet was created, the budget went on-chain from the owner's Circle wallet, and the private link appeared**.
Contractor: opened that link in the same browser → "Blog post: launch announcement" 0.25 USDC with a Drive link → *Submit request* →
timeline showed "Request submitted — signed by your Circle wallet", then "Agent review — Within policy…", then **"Paid 0.25 USDC"** with the
on-chain link, without any wallet software, sign-up, or gas on the contractor's side.

Fixes that came out of looking at it in a real browser: the scaffold's light-mode CSS overrode the dark theme (pinned in `globals.css`);
browser `prompt()`/`confirm()` dialogs replaced by inline forms; the API is now proxied through the dashboard origin (`/api`), so one public
host and no CORS; icon nav, avatars, toasts, skeletons, empty states, a guided three-step add-contractor dialog with a confirm summary
(after Safe's spending-limit flow), and an account card with the owner balance and primary actions (after Circle's escrow sample).

## Demo session (replaces the judge banner)

Checked Stripe (sandbox / test mode is a separate mode with a small indicator in the dashboard, never a banner over the product) and
Sablier (an explicit "Open Example" action to explore). A persistent "you are a judge" banner told the real owner they were a judge and
looked unfinished. Now: `/demo` starts a scoped demo session (approve/decline only), the nav shows a **Demo session** pill while it is
active, the owner sign-in modal offers "Explore the demo instead", the landing page has "Try the live demo", and there is no banner anywhere.
`NEXT_PUBLIC_JUDGE_MODE=true` only enables the demo entry points.
