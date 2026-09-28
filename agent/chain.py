"""web3 reads + writes with Arc's 20 gwei floor baked in. Writes go through the local signer or a Circle wallet."""
import json
import os
import sys
from pathlib import Path

from eth_account import Account
from web3 import Web3

from config import ABI_DIR, AGENT_PK, ALLOWANCE_MANAGER, AUDIT_LOG, CHAIN_ID, MIN_FEE_GWEI, RPC, SIGNER

w3 = Web3(Web3.HTTPProvider(RPC))


def _abi(name: str) -> list:
    return json.loads(Path(ABI_DIR, f"{name}.json").read_text())   # exported from forge out/ by contracts/export_abi.sh


AM = w3.eth.contract(address=Web3.to_checksum_address(ALLOWANCE_MANAGER), abi=_abi("AllowanceManager"))
LOG = w3.eth.contract(address=Web3.to_checksum_address(AUDIT_LOG), abi=_abi("AuditLog"))

acct = Account.from_key(AGENT_PK) if SIGNER == "local" else None
if SIGNER == "circle":
    # ADAPT (Day 2): route writes through the Circle Developer-Controlled agent wallet; no key on this box.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))
    import circle_client as cc  # noqa: E402


def agent_address() -> str:
    return acct.address if acct else os.environ["AGENT_ADDRESS"]


def _send_local(fn):
    """Build/sign/send with Arc's mandatory ≥20 gwei maxFeePerGas. Returns (tx_hash, block_number)."""
    base = w3.eth.get_block("latest").get("baseFeePerGas", 0)
    max_fee = max(int(base * 1.25), Web3.to_wei(MIN_FEE_GWEI, "gwei"))
    tx = fn.build_transaction({
        "from": acct.address, "chainId": CHAIN_ID,
        "nonce": w3.eth.get_transaction_count(acct.address),
        "maxFeePerGas": max_fee, "maxPriorityFeePerGas": Web3.to_wei(1, "gwei"),
    })
    tx["gas"] = int(w3.eth.estimate_gas(tx) * 1.2)
    signed = acct.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    rcpt = w3.eth.wait_for_transaction_receipt(h, timeout=60)
    if rcpt.status != 1:
        raise RuntimeError(f"tx reverted {h.hex()}")
    return "0x" + h.hex().removeprefix("0x"), rcpt.blockNumber


def _block_of(tx_hash: str) -> int:
    return w3.eth.get_transaction_receipt(tx_hash).blockNumber


# ---- treasury (Day 6): YieldSweeper + 4626 vault ----
from config import YIELD_SWEEPER  # noqa: E402

ERC20_MIN = [{"name": "balanceOf", "type": "function", "stateMutability": "view",
              "inputs": [{"name": "a", "type": "address"}], "outputs": [{"type": "uint256"}]}]
USDC_ADDR = Web3.to_checksum_address("0x3600000000000000000000000000000000000000")
SWEEPER = VAULT = None
if YIELD_SWEEPER:
    SWEEPER = w3.eth.contract(address=Web3.to_checksum_address(YIELD_SWEEPER), abi=_abi("YieldSweeper"))
    VAULT = w3.eth.contract(address=SWEEPER.functions.VAULT().call(), abi=_abi("MockUSYC"))   # any ERC-4626 shape
_usdc = w3.eth.contract(address=USDC_ADDR, abi=ERC20_MIN)


def treasury_state() -> dict:
    shares = VAULT.functions.balanceOf(SWEEPER.address).call()
    return {"balance": _usdc.functions.balanceOf(SWEEPER.address).call(), "floor": SWEEPER.functions.reserveFloor().call(),
            "shares": shares, "position_assets": VAULT.functions.convertToAssets(shares).call() if shares else 0}


def sweep(obligations: int):
    if SIGNER == "circle":
        r = cc.agent_sweep(obligations)
        return r["txHash"], _block_of(r["txHash"])
    return _send_local(SWEEPER.functions.sweep(obligations))


def redeem(shares: int):
    if SIGNER == "circle":
        r = cc.agent_redeem(shares)
        return r["txHash"], _block_of(r["txHash"])
    return _send_local(SWEEPER.functions.redeem(shares))


def get_allowance(id: int) -> dict:
    a = AM.functions.allowances(id).call()
    keys = ["owner", "agent", "payee", "capPerPeriod", "perTxCap", "period", "periodStart", "expiry", "spentThisPeriod", "funded", "revoked"]
    return dict(zip(keys, a))


def record(allowance_id: int, dh: bytes, action_code: int, amount: int):
    if SIGNER == "circle":
        r = cc.agent_record(allowance_id, "0x" + dh.hex(), action_code, amount)
        return r["txHash"], _block_of(r["txHash"])
    return _send_local(LOG.functions.record(allowance_id, dh, action_code, amount))


def pay(allowance_id: int, amount: int, dh: bytes, memo: str):
    if SIGNER == "circle":
        r = cc.agent_pay(allowance_id, amount, "0x" + dh.hex(), memo)
        return r["txHash"], _block_of(r["txHash"])
    return _send_local(AM.functions.pay(allowance_id, amount, dh, memo))


def escalate(allowance_id: int, amount: int, dh: bytes, reason: str):
    if SIGNER == "circle":
        r = cc.agent_escalate(allowance_id, amount, "0x" + dh.hex(), reason)
        return r["txHash"], _block_of(r["txHash"])
    return _send_local(AM.functions.escalate(allowance_id, amount, dh, reason[:200]))
