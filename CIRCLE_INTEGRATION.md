# Circle integration ledger

Filled in with ids / tx hashes as each piece lands on ARC-TESTNET (chain id 5042002). "Code ready" = written, unit/locally tested,
awaiting the builder's Circle credentials to run against Circle's APIs.

| Circle tool | Where in code | Network | Status / evidence |
|---|---|---|---|
| Developer-Controlled Wallets | `api/scripts/create_wallets.py` (owner, agent, contractor, judge) · `api/circle_client.py` (`createContractExecutionTransaction` for every owner/agent write) · `agent/chain.py` `SIGNER=circle` · `api/signer.py` `OWNER_SIGNER=circle` | ARC-TESTNET | **live** — every owner/agent write goes through `createContractExecutionTransaction`; the contractor wallet signs milestones with `SigningApi.sign_typed_data` (EIP-712) — wallet set `c8ec70d1-3075-50dc-9064-0aba217752d0`; owner `0x7bc7…5c2f` (id `05792baa-…`), agent `0x380a…8a47` (id `fe4c7642-…`), contractor `0xf863…610c`, judge `0x32b6…ffe0`; entity secret registered Sep 29, 2026 |
| Circle Contracts | deploy with Foundry (`contracts/script/Deploy.s.sol`), then `importContract` so AllowanceManager + AuditLog appear under Circle Contracts and can drive event monitors; bytecode deploy on Arc Testnet is also supported per docs | ARC-TESTNET | deployed via Foundry Sep 29 — AllowanceManager `0x3AAfC635a1D1391c9FD8b5B9d8A518Fe980cb7E6`, AuditLog `0x89264D27AFbCb2Ac90b8a3802340C26Ea1326866`, YieldSweeper v2 `0xA499F1053c66eCE47B49Fb0bA87228Cc729fC9D1` (v1 `0xa8A0D9e701309ABDF7be07Ad8f42528b24746Fc5` superseded), MockUSYC `0x3B0Ab96c493eF7B5e97865061FC627E82F8ad58D`; **imported into Circle Contracts** (ARC-TESTNET, status COMPLETE): AllowanceManager `01a0ea95-2056-727f-9125-1231a8a3bacf`, AuditLog `01a0ea95-8400-7181-9a31-0c08feee2d9a`, YieldSweeper v1 `01a0ea95-8788-7d0a-8aa0-5f7876c1ab5d` (v2 `01a0eaa9-f949-7ab3-9c54-a0c721ec4b41`), MockUSYC `01a0ea95-8d03-7681-94ba-b2bb7bfa5ea6`; source verified on explorer.testnet.arc.io for AllowanceManager, AuditLog, MockUSYC (Blockscout, solc 0.8.24); YieldSweeper v2 verified too |
| USDC (ERC-20, 6 dp) | `AllowanceManager` — every amount is `uint128` in 6-dp USDC; `fund` → `transferFrom`, `pay`/`approveAndPay`/`revoke` → `transfer` | ARC-TESTNET | **live**: `Paid` 0.80 USDC from the Circle agent wallet [`0xea63a3b0…de61`](https://explorer.testnet.arc.io/tx/0xea63a3b0a381c4a9746b92ca2f5551be9138aedf700ba62c4fb185d4e0c6de61) · `Approved` 1.50 USDC from the Circle owner wallet [`0x71808a88…5791`](https://explorer.testnet.arc.io/tx/0x71808a88a31abc7da50d61d90af18dcd67ff1525857e862507f7e4c1579e5791) · `AuditLog.record` [`0x04a63c28…01fb`](https://explorer.testnet.arc.io/tx/0x04a63c281b7c6d90bca2b7f3ac3322d24acf97cbfb9bc89a8fc9a4f6640f01fb) |
| USYC / MockUSYC | `YieldSweeper.sweep` / `redeem` against an ERC-4626 vault; `MockUSYC` until the Teller allowlist lands (disclosed) | ARC-TESTNET | **live**: `sweep()` 2.00 USDC from the Circle agent wallet [`0x2d3cf2c8…a0b9`](https://explorer.testnet.arc.io/tx/0x2d3cf2c8eedc6143fd9450a4aa5ab4c3afee6d2cafddaadbd74c78a47783a0b9) + `record(SWEEP)` [`0x118dad18…baaa`](https://explorer.testnet.arc.io/tx/0x118dad18757e4cda2ba2772d51ee70fb727dd8151b13daa1f434c3cfe4eebaaa); vault is `MockUSYC` (disclosed) until the USYC allowlist ticket is approved — ticket #: _to file_ |
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

## Sep 29, 2026 — testnet go-live log

- Deployer `0x526dd81859c728963f1a6007110f24014F520FE2` (Foundry, 25 gwei, ~0.09 USDC gas for all four contracts).
- Deploy txs: AllowanceManager `0xf3dab095…15cd`, AuditLog `0x81a8c25f…847e`, MockUSYC `0xbfae91f9…1ee8`, YieldSweeper `0x2159648…71f3`.
- Entity secret registered via the Python SDK (`register_entity_secret_ciphertext`); recovery file kept off-repo.
- Wallet set `c8ec70d1-3075-50dc-9064-0aba217752d0`, four EOA wallets on ARC-TESTNET (owner / agent / contractor / judge), all `LIVE`.
- `importContract` gotcha: the request 400s when a `description` is included; `name` + `address` + `blockchain` + `idempotencyKey` works.
- YieldSweeper v1 set `owner = msg.sender` (the deployer), so the Circle owner wallet's `setFloor` hit `ESTIMATION_ERROR`; v2 takes an explicit `owner` and adds `setAgent` / `transferOwnership`. Redeployed as `0xA499F1053c66eCE47B49Fb0bA87228Cc729fC9D1` (tx `0x79854caa…a890`), reserve moved over, v1 kept for the record.
- Native-value transfers into a contract with no payable `receive()` revert on Arc like anywhere else; fund contracts through the ERC-20 `transfer` on `0x3600…`.
- Blockscout verify gotcha: the public explorer rate-limits `getabi`; use `forge verify-contract --skip-is-verified-check`.

## Verified on Day 7 (CCTP V2, from the Circle docs mirror)

Domains: Arc Testnet **26**, Base Sepolia **6**. Testnet `TokenMessengerV2` `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` and
`MessageTransmitterV2` `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` are the same on both chains. `depositForBurn(amount, destDomain,
mintRecipient, burnToken, destinationCaller, maxFee, minFinalityThreshold)`; 1000 = Fast, 2000 = Standard. Attestation:
`https://iris-api-sandbox.circle.com/v2/messages/26?transactionHash=…`; fees: `/v2/burn/USDC/fees/26/6`.

## Prior work disclosure

Wallet-creation shape and Circle notification signature verification are adapted from `circlefin/arc-escrow` (Apache-2.0).
Everything else was written Sep 28 – Oct 10, 2026.
