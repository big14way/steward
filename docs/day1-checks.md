# Day 1 checks — Sep 28, 2026

Status of the build spec's §0 "[A] must confirm" items and §14 Day-1 checks, plus every ADAPT marker touched today.

## Verified live against Arc Testnet (`https://rpc.testnet.arc.io`)

| Claim | Result |
|---|---|
| Chain id | `0x4cef52` = **5042002** ✅ (same on `rpc.testnet.arc.network`) |
| Min base fee | `baseFeePerGas` = **20.0 gwei** exactly; `eth_gasPrice` = 25 gwei ✅ |
| USDC ERC-20 at `0x3600…0000` | 1798 bytes of code, `decimals()` = 6, `symbol()` = `USDC` ✅ |
| Explorer | `https://explorer.testnet.arc.io` is canonical; `https://testnet.arcscan.app` 301-redirects to it. Blockscout verify endpoint: `https://explorer.testnet.arc.io/api` ✅ |
| Seeded blocklisted address | `test_arc_payToBlocklistedPayeeReverts` **passes on a testnet fork** (transfer reverts) ✅ |
| `vm.deal` on precompile-backed balance (ADAPT in `ArcForkTest.setUp`) | **Works** on the testnet fork: `balanceOf == balance / 1e12` holds after `vm.deal` ✅ |

## Tooling installed

| Tool | Version |
|---|---|
| Foundry (upstream) | forge 1.7.1 |
| arc-foundry | v0.8.0-2 (`arc-forge` / `arc-cast` / `arc-anvil` 1.7.1-dev), needs `brew install libusb` on macOS |
| Circle CLI | `@circle-fin/cli` 1.1.4 (`circle`) |
| ARC CLI | `arc-canteen` via `uv tool install git+https://github.com/the-canteen-dev/ARC-cli`; `arc-canteen context sync` mirrors Arc + Circle docs to `~/.arc-canteen/context/` |
| OpenZeppelin / forge-std | v5.7.0 / v1.16.2 (git submodules under `contracts/lib/`) |

## Tests

- `forge test`: **33 passed** (30 unit/fuzz in `AllowanceManagerTest` + 3 `ArcForkTest` which early-return off-Arc).
- `arc-forge test --fork-url https://rpc.testnet.arc.io --match-contract ArcForkTest`: **3 passed**.
- `arc-forge test --fork-url http://127.0.0.1:8545` against `arc-anvil --network arc --chain-id 5042002`: 2 passed, blocklist test does **not** revert locally because arc-anvil does not seed the testnet blocklist entry. Use the testnet fork for that test.

## [A] items

| Item | Finding |
|---|---|
| Circle Contracts deploying custom bytecode to ARC-TESTNET | **Confirmed in docs**: `contracts/scp-deploy-smart-contract` ("Deploy a Smart Contract using Bytecode") and `contracts/supported-blockchains` lists Arc Testnet. `importContract` also exists (`contracts/scp-event-monitoring` step 2). Plan: deploy with Foundry (Appendix C), then `importContract` both contracts. Caveat from Circle's `use-smart-contract-platform` skill: a Circle-side bytecode deploy on Arc Testnet can fail with `ESTIMATION_ERROR` / `Create2: Failed on deploy` if bytecode has `PUSH0`; recompile with `evm_version = "paris"` if that happens. Not applicable to Foundry deploys (Arc runs Osaka). |
| `createContractExecutionTransaction` from a Dev-Controlled Wallet on ARC-TESTNET | **Confirmed** in the Arc ERC-8183 tutorial: `{walletAddress|walletId, blockchain:"ARC-TESTNET", contractAddress, abiFunctionSignature, abiParameters:[strings], fee:{type:"level",config:{feeLevel:"MEDIUM"}}}`. |
| "No built-in policy engine" quote | Verified verbatim on developers.circle.com/wallets/dev-controlled (Treasury and liquidity management section). Quoted in README. |

## ADAPT markers hit today and what was done

| Where | Issue | Resolution |
|---|---|---|
| `forge init --no-git --no-commit` | flag removed in forge 1.7 | project files written directly |
| `AuditLog log;` in tests | collides with forge-std `event log(string)` | renamed to `auditLog` |
| `_get()` tuple destructure | "stack too deep" on solc 0.8.24 | `abi.decode` the getter output into the struct (static-only struct ⇒ identical ABI layout) |
| `evm_version = "osaka"` with solc 0.8.24 | solc 0.8.24 predates Osaka; forge silently normalises to the highest it supports (cancun) | kept as-is; bytecode is Osaka-compatible. Revisit if verification complains. |
| `arc-anvil --network arc` | reports chain id 31337, so `onlyArc` gate skips | pass `--chain-id 5042002` |
| arc-foundry binaries | dyld: `libusb-1.0.0.dylib` missing | `brew install libusb` |
| Circle CLI `wallets` | no such resource in CLI 1.1.4 (it has `contract deploy`, `bridge`, `earn`, `gateway`, `services` for x402) | wallets are created with the Python SDK (`api/scripts/create_wallets.py`) |

## Needs the builder (cannot be done by the coding agent)

1. Luma registration (passphrase in spec) + Canteen Discord + Arc builder Discord.
2. Circle Console: create API key + register entity secret → `api/.env` (`CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`), then `python api/scripts/create_wallets.py`.
3. Faucet USDC (Arc Testnet) to the owner and agent addresses: https://faucet.circle.com
4. **File the USYC allowlist ticket** at support.circle.com with the agent wallet address (24–48 h turnaround).
5. `arc-canteen login` (GitHub OAuth) to get the Canteen-hosted RPC + register as a builder.
6. Name check: search "Steward" + Arc/Canteen (alternates: Bursar, Tally, Vestiary).
