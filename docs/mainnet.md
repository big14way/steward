# Arc Mainnet (Oct 14, 2026) — the reduced instance

Arc mainnet is chain **5042**, RPC `https://rpc.mainnet.arc.io`, explorer `https://explorer.arc.io`, gas paid in USDC at a 20 gwei floor
(1M gas = 0.02 USDC). The testnet deployment stays as it is; mainnet runs as a second, smaller instance beside it.

## What runs on mainnet and what does not

| Piece | Mainnet | Why |
|---|---|---|
| AllowanceManager + AuditLog | yes (`script/DeployCore.s.sol`, ~1.6M gas, ~0.03 USDC) | the product |
| Agent | yes, `SIGNER=local` | Circle mainnet access is a separate onboarding; not granted yet |
| API | yes, `OWNER_SIGNER=local`, one launch workspace, sign-up off | same |
| Dashboard | yes, `NEXT_PUBLIC_CHAIN_ID=5042` | labels, EIP-712 domain, wagmi chain and explorer follow it |
| Contractors | bring their own Arc address (link auth) | no Circle wallet creation without Circle mainnet |
| YieldSweeper / USYC | no (`YIELD_SWEEPER` empty; treasury loop idles) | USYC needs Circle to allowlist the holder |
| CCTP to Base, Gas Station, webhooks | no | need Circle mainnet wallets |

Everything is env-driven since this change: `CHAIN_ID`, `ARC_RPC`, `EXPLORER` (API and agent), `NETWORK_NAME` (agent),
`CIRCLE_BLOCKCHAIN` (`ARC-TESTNET` | `ARC`), `CCTP_*`, `IRIS_API`, `USYC_*` (API), `NEXT_PUBLIC_CHAIN_ID` (web).
Mainnet addresses (docs.arc.io/arc/references/contract-addresses): USDC `0x3600…0000` (same as testnet), USYC Teller
`0x51A8CE47dC08ba5CD19c7aa84EA6fD6664f60f9b`, USYC `0x8a5D989Bbb96929F689B0200f435f53dA42bF490`, CCTP TokenMessengerV2
`0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`, MessageTransmitterV2 `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64`, domain 26.

## Money

About 2 USDC on Arc mainnet in the deployer covers everything: deploy 0.03, gas for the first few dozen calls 0.10, one funded
contractor budget 1.00 (moves to the contractor, not spent), buffer. Bybit withdraws USDC on "Arc" directly (min 2 USDC;
network fee covered by Bybit for a limited time per its Sep 17, 2026 announcement).

Keys: the Foundry deployer doubles as the owner (`OWNER_PRIVATE_KEY`, `OWNER_SIGNER=local`); the agent has its own local key
(`cast wallet new`). Both live only in `api/.env.mainnet` and `agent/.env.mainnet` (gitignored) and in Railway variables.

## Steps

1. Fund the deployer `0x526dd81859c728963f1a6007110f24014F520FE2` with ~2 USDC on Arc.
2. Deploy: `cd contracts && set -a && source .env && set +a && forge script script/DeployCore.s.sol --rpc-url arc_mainnet --broadcast --with-gas-price 20gwei --priority-gas-price 1gwei`.
   The deployer's mainnet nonce is 0, so the addresses come out identical to testnet (`0x3AAf…b7E6`, `0x8926…6866`).
   Verify on Blockscout: `forge verify-contract --chain 5042 --verifier blockscout --verifier-url https://explorer.arc.io/api <addr> src/AllowanceManager.sol:AllowanceManager --constructor-args $(cast abi-encode "constructor(address)" 0x3600000000000000000000000000000000000000) --skip-is-verified-check`.
3. Fund the agent with 0.20 USDC for gas: `cast send 0x3600000000000000000000000000000000000000 "transfer(address,uint256)" <agent> 200000 --rpc-url arc_mainnet --private-key $DEPLOYER_PRIVATE_KEY --gas-price 20gwei`.
4. Fill `ALLOWANCE_MANAGER` / `AUDIT_LOG` in both `.env.mainnet` files; `cp contracts/abi` is already in the Docker images.
5. Railway: two new services in project `steward` (`api-mainnet` from `Dockerfile.api` with a `/data` volume, `agent-mainnet` from
   `Dockerfile.agent`), variables from the two `.env.mainnet` files, `API_BASE` of the agent = the api-mainnet public domain.
6. Vercel: a second project `steward-mainnet` on `web/` with `NEXT_PUBLIC_CHAIN_ID=5042`, `NEXT_PUBLIC_EXPLORER=https://explorer.arc.io`,
   `NEXT_PUBLIC_ALLOWANCE_MANAGER`, `API_INTERNAL=<api-mainnet domain>`, `NEXT_PUBLIC_JUDGE_MODE=false`; Deployment Protection off.
7. One real cycle: sign in as the launch owner, add a contractor with an Arc address, fund 1 USDC, open the private link, request 0.25 USDC,
   watch the agent `PAY`; then one over the cap to see `ESCALATE` and approve it. Both records land on AuditLog on explorer.arc.io.
8. README: a "Mainnet" row with the addresses and the two transactions; submit on DoraHacks (Arc Microgrants, closes Oct 14 23:59 ET).
