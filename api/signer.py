"""Owner-side writes. OWNER_SIGNER=circle routes through the Circle Developer-Controlled owner wallet (production path,
no key on the server). OWNER_SIGNER=local signs with OWNER_PRIVATE_KEY on this box (local arc-anvil e2e + fallback).
Both return {'txHash': ..., 'state': ...}. Which one is in use is reported by /health."""
import json
import os
from pathlib import Path

from web3 import Web3

OWNER_SIGNER = os.getenv("OWNER_SIGNER", "circle")
RPC = os.getenv("ARC_RPC", "https://rpc.testnet.arc.io")
CHAIN_ID = int(os.getenv("CHAIN_ID", "5042002"))
MIN_FEE_GWEI = 20
USDC = "0x3600000000000000000000000000000000000000"
ABI_DIR = Path(os.getenv("ABI_DIR", Path(__file__).resolve().parent.parent / "contracts" / "abi"))

w3 = Web3(Web3.HTTPProvider(RPC))


def abi(name: str) -> list:
    return json.loads(Path(ABI_DIR, f"{name}.json").read_text())


ERC20_MIN = [
    {"name": "approve", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "spender", "type": "address"}, {"name": "value", "type": "uint256"}], "outputs": [{"type": "bool"}]},
    {"name": "transfer", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "to", "type": "address"}, {"name": "value", "type": "uint256"}], "outputs": [{"type": "bool"}]},
    {"name": "balanceOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "a", "type": "address"}], "outputs": [{"type": "uint256"}]},
]


def _am():
    return w3.eth.contract(address=Web3.to_checksum_address(os.environ["ALLOWANCE_MANAGER"]), abi=abi("AllowanceManager"))


def _send_local(fn) -> dict:
    from eth_account import Account
    acct = Account.from_key(os.environ["OWNER_PRIVATE_KEY"])
    base = w3.eth.get_block("latest").get("baseFeePerGas", 0)
    max_fee = max(int(base * 1.25), Web3.to_wei(MIN_FEE_GWEI, "gwei"))
    tx = fn.build_transaction({
        "from": acct.address, "chainId": CHAIN_ID, "nonce": w3.eth.get_transaction_count(acct.address),
        "maxFeePerGas": max_fee, "maxPriorityFeePerGas": Web3.to_wei(1, "gwei"),
    })
    tx["gas"] = int(w3.eth.estimate_gas(tx) * 1.2)
    h = w3.eth.send_raw_transaction(acct.sign_transaction(tx).raw_transaction)
    rcpt = w3.eth.wait_for_transaction_receipt(h, timeout=60)
    if rcpt.status != 1:
        raise RuntimeError(f"tx reverted {h.hex()}")
    return {"state": "COMPLETE", "txHash": "0x" + h.hex().removeprefix("0x"), "block": rcpt.blockNumber}


def owner_address() -> str:
    if OWNER_SIGNER == "local":
        from eth_account import Account
        return Account.from_key(os.environ["OWNER_PRIVATE_KEY"]).address
    return os.environ["OWNER_ADDRESS"]


def owner_create(agent_addr: str, payee: str, cap_period: int, per_tx: int, period: int, expiry: int, wallet_id: str | None = None) -> dict:
    if OWNER_SIGNER == "circle":
        import circle_client as cc
        return cc.owner_create(agent_addr, payee, cap_period, per_tx, period, expiry, wallet_id)
    return _send_local(_am().functions.create(Web3.to_checksum_address(agent_addr), Web3.to_checksum_address(payee), cap_period, per_tx, period, expiry))


def owner_fund(allowance_id: int, amount: int, wallet_id: str | None = None) -> dict:
    if OWNER_SIGNER == "circle":
        import circle_client as cc
        cc.owner_approve_usdc(amount, wallet_id)
        return cc.owner_fund(allowance_id, amount, wallet_id)
    usdc = w3.eth.contract(address=Web3.to_checksum_address(USDC), abi=ERC20_MIN)
    _send_local(usdc.functions.approve(Web3.to_checksum_address(os.environ["ALLOWANCE_MANAGER"]), amount))
    return _send_local(_am().functions.fund(allowance_id, amount))


def owner_approve_and_pay(allowance_id: int, amount: int, decision_hash_hex: str, wallet_id: str | None = None) -> dict:
    if OWNER_SIGNER == "circle":
        import circle_client as cc
        return cc.owner_approve_and_pay(allowance_id, amount, decision_hash_hex, wallet_id)
    return _send_local(_am().functions.approveAndPay(allowance_id, amount, bytes.fromhex(decision_hash_hex.removeprefix("0x"))))


def owner_transfer_usdc(to: str, amount: int, wallet_id: str | None = None) -> dict:
    """Move USDC from the owner wallet to `to` (e.g. top up the YieldSweeper reserve)."""
    if OWNER_SIGNER == "circle":
        import circle_client as cc
        return cc.owner_transfer_usdc(to, amount, wallet_id)
    usdc = w3.eth.contract(address=Web3.to_checksum_address(USDC), abi=ERC20_MIN)
    return _send_local(usdc.functions.transfer(Web3.to_checksum_address(to), amount))


def owner_revoke(allowance_id: int, wallet_id: str | None = None) -> dict:
    if OWNER_SIGNER == "circle":
        import circle_client as cc
        return cc.owner_revoke(allowance_id, wallet_id)
    return _send_local(_am().functions.revoke(allowance_id))
