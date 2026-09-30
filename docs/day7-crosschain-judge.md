# Day 7 — CCTP V2 payout to Base Sepolia + judge mode (code Sep 28, 2026; first testnet run Sep 29, 2026)

## Cross-chain payout

The contractor ticks **Receive on Base Sepolia** (or passes `--payout base-sepolia` to `submit_milestone.py`). The choice is part of
the EIP-712 `Milestone` struct (`payoutChain`), so it is signed by the payee and cannot be flipped by anyone else.

Flow (honest about caps — the spec's note, made explicit in code):

1. The agent runs the same rules (screen → evidence → per-tx cap → liquidity). A cross-chain request that would have been
   `PAY`/`PARTIAL` becomes an **`ESCALATE`** with rule `R5_pay_xchain` (etc.), because a CCTP burn from the owner wallet cannot be
   bounded by `AllowanceManager`. `SCREEN_FAIL` and `HOLD` are unchanged. The decision is hashed and `record()`ed as usual.
2. The owner approves it (dashboard or Telegram). `POST /escalations/{hash}/approve` sees `payout_chain = base-sepolia` and runs
   `api/cctp.py::payout_crosschain(remainder, payee, OWNER_WALLET_ID)`:
   `approve(TokenMessengerV2)` → `depositForBurn(amount, 6, bytes32(payee), USDC, 0x0, maxFee, 1000)` on Arc from the owner's
   Circle wallet → poll `iris-api-sandbox.circle.com/v2/messages/26?transactionHash=` until `complete` →
   `MessageTransmitterV2.receiveMessage(message, attestation)` on Base Sepolia from `BASE_RELAYER_WALLET_ID`.
3. The decision stores `approved_tx = burn tx` and `mint_tx`; the milestone is `paid` with the mint tx; the decisions page links both explorers.

Verified from the Circle docs mirror (`developers.circle.com/cctp/…`): domains Arc Testnet **26**, Base Sepolia **6**;
TokenMessengerV2 `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` and MessageTransmitterV2 `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275`
are the same on both testnets; `minFinalityThreshold` 1000 = Fast, 2000 = Standard; fee schedule at
`/v2/burn/USDC/fees/26/6`; attestation at `/v2/messages/26?transactionHash=…`.

### Testnet run (Sep 29, 2026)

Freelancer (own wallet `0x3C34…4C51`) requested 0.25 USDC with **Receive on Base Sepolia** from the hosted portal. The agent
escalated it (`R5_pay_xchain`, escalate tx `0x4f239229…59cc`); the owner approved it from the Approvals inbox, and the one API
call did the whole path in 23 s:

| Step | Chain | Tx |
|---|---|---|
| `approve` + `depositForBurn` from the owner's Circle wallet | Arc Testnet | [`0x45c44615…f42`](https://explorer.testnet.arc.io/tx/0x45c44615164bc5ced86c8431ccefdb5452b2ffd56096126b1c24b937ddf91f42) |
| attestation | iris-api-sandbox | `complete` within ~10 s (Fast, fee 0) |
| `receiveMessage` from the relayer (Circle SCA wallet, gas sponsored) | Base Sepolia | [`0x38601eaf…d7f0`](https://sepolia.basescan.org/tx/0x38601eafd631f5d2bd195f21e076930ebcc2cb3d70cc23ba3f243c2f5de7d7f0) |

The relayer is `BASE_RELAYER_WALLET_ID` on the API host; it never held ETH (ERC-4337 via Circle Gas Station).

## Judge mode

`NEXT_PUBLIC_JUDGE_MODE=true` shows the banner. The judge *is* the owner of Acme Studio: the owner secret in the README unlocks
`/escalations` and `/allowances`, and every signature happens server-side through the owner's Circle Developer-Controlled wallet.
The builder pre-funds that wallet and keeps allowance #0 funded, and leaves at least one escalation pending before submission
(the 350 USDC "over per-tx cap" request from the video), so the judge can approve it and see `approveAndPay()` land.
Nothing to install; a MetaMask-on-Arc contractor flow is optional and documented on `/contractor`.
