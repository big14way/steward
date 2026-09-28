"""CCTP V2 payout: burn USDC on Arc Testnet from the owner wallet, mint to the contractor on Base Sepolia (Day 7).

Verified Sep 28, 2026 against developers.circle.com/cctp (references/contract-addresses, concepts/supported-chains-and-domains,
migration-from-v1-to-v2) via the local doc mirror:
  - domains: Arc Testnet 26, Base Sepolia 6
  - testnet TokenMessengerV2   0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA (same address on Arc Testnet and Base Sepolia)
  - testnet MessageTransmitterV2 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275 (same on both)
  - depositForBurn(amount, destinationDomain, mintRecipient bytes32, burnToken, destinationCaller bytes32, maxFee, minFinalityThreshold)
    minFinalityThreshold 1000 = Fast Transfer, 2000 = Standard; maxFee in burn-token units (fee schedule at
    GET https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/{src}/{dst})
  - attestation: GET https://iris-api-sandbox.circle.com/v2/messages/{sourceDomain}?transactionHash={burnTx} → messages[0].{status,message,attestation}
  - mint: MessageTransmitterV2.receiveMessage(message, attestation) on the destination, from any funded wallet there.

This path bypasses AllowanceManager caps, so it is only ever executed with owner authority (an approved escalation) and the
decision is marked with the burn tx as `approved_tx` — see README. Needs BASE_RELAYER_WALLET_ID: a Circle Developer-Controlled
wallet on BASE-SEPOLIA with a little ETH for gas (Circle Gas Station can sponsor SCA wallets).
"""
import os
import time

import httpx

import circle_client as cc

USDC_ARC = "0x3600000000000000000000000000000000000000"
TOKEN_MESSENGER_V2 = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA"
MESSAGE_TRANSMITTER_V2 = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"
ARC_TESTNET_DOMAIN = 26
BASE_SEPOLIA_DOMAIN = 6
IRIS = os.getenv("IRIS_API", "https://iris-api-sandbox.circle.com")
FAST = 1000       # minFinalityThreshold for Fast Transfer
STANDARD = 2000


def to_bytes32(addr: str) -> str:
    return "0x" + addr[2:].lower().rjust(64, "0")


def fee_quote(amount: int, fast: bool = True) -> int:
    """Max fee (6-dp USDC) for this transfer from Circle's fee schedule; 0 if the schedule says free."""
    r = httpx.get(f"{IRIS}/v2/burn/USDC/fees/{ARC_TESTNET_DOMAIN}/{BASE_SEPOLIA_DOMAIN}", timeout=20)
    r.raise_for_status()
    rows = r.json() if isinstance(r.json(), list) else r.json().get("data", [])
    threshold = FAST if fast else STANDARD
    for row in rows:
        if int(row.get("finalityThreshold", 0)) == threshold:
            bps = int(row.get("minimumFee", 0))
            return (amount * bps + 9_999) // 10_000
    return 0


def wait_attestation(burn_tx: str, timeout: int = 600) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = httpx.get(f"{IRIS}/v2/messages/{ARC_TESTNET_DOMAIN}", params={"transactionHash": burn_tx}, timeout=20)
        if r.status_code == 200:
            msgs = r.json().get("messages", [])
            if msgs and msgs[0].get("status") == "complete":
                return msgs[0]
        time.sleep(5)
    raise TimeoutError(f"attestation for {burn_tx}")


def payout_crosschain(amount: int, recipient: str, from_wallet_id: str, fast: bool = True) -> dict:
    """approve → depositForBurn on Arc (owner wallet) → attestation → receiveMessage on Base Sepolia (relayer wallet)."""
    max_fee = fee_quote(amount, fast)
    cc.wait(cc.execute(from_wallet_id, USDC_ARC, "approve(address,uint256)", [TOKEN_MESSENGER_V2, str(amount)]))
    burn = cc.wait(cc.execute(from_wallet_id, TOKEN_MESSENGER_V2,
                              "depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)",
                              [str(amount), str(BASE_SEPOLIA_DOMAIN), to_bytes32(recipient), USDC_ARC, "0x" + "0" * 64,
                               str(max_fee), str(FAST if fast else STANDARD)]))
    m = wait_attestation(burn["txHash"])
    mint = cc.wait(cc.execute(os.environ["BASE_RELAYER_WALLET_ID"], MESSAGE_TRANSMITTER_V2,
                              "receiveMessage(bytes,bytes)", [m["message"], m["attestation"]]))
    return {"burn_tx": burn["txHash"], "mint_tx": mint["txHash"], "max_fee": max_fee, "amount": amount, "recipient": recipient}
