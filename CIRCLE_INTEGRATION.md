# Circle integration ledger

Filled in with ids / tx hashes as each piece lands on ARC-TESTNET (chain id 5042002). "Code ready" = written, unit/locally tested,
awaiting the builder's Circle credentials to run against Circle's APIs.

| Circle tool | Where in code | Network | Status / evidence |
|---|---|---|---|
| Developer-Controlled Wallets | `api/scripts/create_wallets.py` (owner, agent, contractor, judge) · `api/circle_client.py` (`createContractExecutionTransaction` for every owner/agent write) · `agent/chain.py` `SIGNER=circle` · `api/signer.py` `OWNER_SIGNER=circle` | ARC-TESTNET | code ready — wallet ids: _pending `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET`_ |
| Circle Contracts | deploy with Foundry (`contracts/script/Deploy.s.sol`), then `importContract` so AllowanceManager + AuditLog appear under Circle Contracts and can drive event monitors; bytecode deploy on Arc Testnet is also supported per docs | ARC-TESTNET | verified in docs (Day 1) — contract ids: _pending deploy_ |
| USDC (ERC-20, 6 dp) | `AllowanceManager` — every amount is `uint128` in 6-dp USDC; `fund` → `transferFrom`, `pay`/`approveAndPay`/`revoke` → `transfer` | ARC-TESTNET | local `Paid` txs on arc-anvil; fork test on real USDC passes — testnet `Paid` tx: _pending_ |
| USYC / MockUSYC | `YieldSweeper.sweep` / `redeem` against an ERC-4626 vault; `MockUSYC` until the Teller allowlist lands (disclosed) | ARC-TESTNET | local SWEEP 760 / REDEEM 600 on arc-anvil — testnet tx + ticket #: _pending_ |
| CCTP V2 | `api/cctp.py` — owner wallet `depositForBurn` on Arc (domain 26) → attestation → `receiveMessage` on Base Sepolia (domain 6); triggered by an approved `_xchain` escalation | ARC-TESTNET → BASE-SEPOLIA | addresses/domains verified in docs; burn / mint tx: _pending relayer wallet_ |
| Circle notifications | `api/circle_webhook_verify.py` + `POST /webhooks/circle` — signature verified with the public key from `/v2/notifications/publicKey/{keyId}` (ported from `circlefin/arc-escrow`) | — | code ready — subscription id: _pending_ |
| EURC | payee currency option | ARC-TESTNET | not reached (Day 10 if slack) |
| Agent Nanopayments (x402) | `agent/screen.py` — pay per screening lookup via `circle services pay` | ARC-TESTNET | stretch, not reached |
| Gateway | unified balance in owner UI (`circle gateway balance`) | — | stretch, not reached |
| Circle CLI | installed (`@circle-fin/cli` 1.1.4); used for `bridge` / `gateway` / `services` in the stretch goals — it has no wallet-creation command, hence the SDK script | — | — |

## Verified on Day 1 (Sep 28, 2026)

- Circle Contracts supports **bytecode deploy** (`contracts/scp-deploy-smart-contract`) and **`importContract`** on **Arc Testnet**
  (`contracts/supported-blockchains`). Caveat from Circle's `use-smart-contract-platform` skill: if a Circle-side bytecode deploy fails with
  `ESTIMATION_ERROR` / `Create2: Failed on deploy`, recompile with `evm_version = "paris"` (no `PUSH0`).
- Developer-Controlled Wallets create on `ARC-TESTNET` with `accountType: "EOA"` and execute arbitrary contract functions via
  `createContractExecutionTransaction` (uint/bytes32 params as strings) — shape taken from Arc's ERC-8183 tutorial.
- Quote used in the README, verbatim from developers.circle.com/wallets/dev-controlled: *"Dev-controlled wallets do not include a built-in
  policy engine. If you require transaction restrictions, destination allowlists, or multi-party approval flows, enforce those controls in
  your own application logic before calling Circle APIs."*
- SDK versions at time of writing: `circle-developer-controlled-wallets` 9.6.0 / `circle-smart-contract-platform` 9.6.0 (PyPI);
  `@circle-fin/developer-controlled-wallets` 10.8.1 / `@circle-fin/smart-contract-platform` 10.8.1 (npm); Circle CLI 1.1.4.

## Verified on Day 7 (CCTP V2, from the Circle docs mirror)

Domains: Arc Testnet **26**, Base Sepolia **6**. Testnet `TokenMessengerV2` `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` and
`MessageTransmitterV2` `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` are the same on both chains. `depositForBurn(amount, destDomain,
mintRecipient, burnToken, destinationCaller, maxFee, minFinalityThreshold)`; 1000 = Fast, 2000 = Standard. Attestation:
`https://iris-api-sandbox.circle.com/v2/messages/26?transactionHash=…`; fees: `/v2/burn/USDC/fees/26/6`.

## Prior work disclosure

Wallet-creation shape and Circle notification signature verification are adapted from `circlefin/arc-escrow` (Apache-2.0).
Everything else was written Sep 28 – Oct 10, 2026.
