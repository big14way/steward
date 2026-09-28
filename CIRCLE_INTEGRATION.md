# Circle integration ledger

Filled in with ids / tx hashes as each piece lands. Network is ARC-TESTNET (chain id 5042002) unless noted.

| Circle tool | Where in code | Network | Evidence (tx / id) |
|---|---|---|---|
| Developer-Controlled Wallets | `api/scripts/create_wallets.py` (owner, agent, contractor, judge) | ARC-TESTNET | _pending: needs `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET`_ |
| Circle Contracts | deploy via Foundry (`contracts/script/Deploy.s.sol`), then `importContract` so they show under Circle Contracts | ARC-TESTNET | _Day 2_ |
| USDC (ERC-20 6dp) | `AllowanceManager` — every amount is `uint128` in 6-dp USDC | ARC-TESTNET | _Day 2: first `Paid` tx_ |
| USYC / MockUSYC | `YieldSweeper.sweep` | ARC-TESTNET | _Day 6 (+ USYC allowlist ticket # if pending)_ |
| CCTP V2 | `api/cctp.py` contractor payout | ARC-TESTNET → BASE-SEPOLIA | _Day 7_ |
| EURC | payee currency option | ARC-TESTNET | _Day 10 if slack_ |
| Agent Nanopayments (x402) | `agent/screen.py` | ARC-TESTNET | _stretch_ |
| Gateway | unified balance in owner UI | — | _stretch_ |

## Verified on Day 1 (Sep 28, 2026)

- Circle Contracts supports **bytecode deploy** (`/contracts/scp-deploy-smart-contract`) and **`importContract`** on **Arc Testnet** (`/contracts/supported-blockchains`). So the plan is: deploy with Foundry, then import both contracts so they are visible (and event-monitorable) under Circle Contracts. Caveat from Circle's `use-smart-contract-platform` skill: if a Circle-side bytecode deploy fails with `ESTIMATION_ERROR` / `Create2: Failed on deploy`, recompile with `evm_version = "paris"` (no `PUSH0`).
- Developer-Controlled Wallets create on `ARC-TESTNET` with `accountType: "EOA"`, and execute arbitrary contract functions via `createContractExecutionTransaction` (uint/bytes32 params as strings).
- SDK versions at time of writing: `circle-developer-controlled-wallets` 9.6.0 / `circle-smart-contract-platform` 9.6.0 (PyPI); `@circle-fin/developer-controlled-wallets` 10.8.1 / `@circle-fin/smart-contract-platform` 10.8.1 (npm); Circle CLI 1.1.4.
