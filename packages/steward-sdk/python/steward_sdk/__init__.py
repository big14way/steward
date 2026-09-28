"""steward-sdk — per-payee on-chain allowances + decision log + escalation for agents that pay people in USDC on Arc.

    from steward_sdk import Steward
    s = Steward(allowance_manager="0x…", audit_log="0x…", agent_private_key=os.environ["AGENT_PK"])
    r = s.decide(allowance_id=0, amount=150_000_000, memo="logo v2", inputs={...}, evidence=True, screen_ok=True)

Same rules, canonical hashing and remainder-hash convention as the reference agent in github.com/big14way/steward.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from eth_account import Account
from eth_utils import keccak
from web3 import Web3

__all__ = ["Steward", "DecideResult", "apply_rules", "canonical", "decision_hash", "remainder_hash", "ACTION_CODE", "MIN_FEE_GWEI"]

Action = Literal["HOLD", "PAY", "PARTIAL", "ESCALATE", "SCREEN_FAIL"]
ACTION_CODE = {"HOLD": 0, "PAY": 1, "PARTIAL": 2, "ESCALATE": 3, "SWEEP": 4, "REDEEM": 5, "SCREEN_FAIL": 6}
MIN_FEE_GWEI = 20                      # Arc floor — never lower
ARC_TESTNET_CHAIN_ID = 5042002
REMAINDER_TAG = b"STEWARD/remainder"

AM_ABI = json.loads("""[
 {"type":"function","name":"pay","stateMutability":"nonpayable","inputs":[{"name":"id","type":"uint256"},{"name":"amount","type":"uint128"},{"name":"decisionHash","type":"bytes32"},{"name":"memo","type":"string"}],"outputs":[]},
 {"type":"function","name":"escalate","stateMutability":"nonpayable","inputs":[{"name":"id","type":"uint256"},{"name":"amount","type":"uint128"},{"name":"decisionHash","type":"bytes32"},{"name":"reason","type":"string"}],"outputs":[]},
 {"type":"function","name":"allowances","stateMutability":"view","inputs":[{"name":"id","type":"uint256"}],"outputs":[{"name":"owner","type":"address"},{"name":"agent","type":"address"},{"name":"payee","type":"address"},{"name":"capPerPeriod","type":"uint128"},{"name":"perTxCap","type":"uint128"},{"name":"period","type":"uint64"},{"name":"periodStart","type":"uint64"},{"name":"expiry","type":"uint64"},{"name":"spentThisPeriod","type":"uint128"},{"name":"funded","type":"uint128"},{"name":"revoked","type":"bool"}]},
 {"type":"function","name":"usedDecision","stateMutability":"view","inputs":[{"name":"h","type":"bytes32"}],"outputs":[{"type":"bool"}]},
 {"type":"function","name":"nextId","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]}
]""")
LOG_ABI = json.loads("""[
 {"type":"function","name":"record","stateMutability":"nonpayable","inputs":[{"name":"allowanceId","type":"uint256"},{"name":"decisionHash","type":"bytes32"},{"name":"action","type":"uint8"},{"name":"amount","type":"uint128"}],"outputs":[]}
]""")
KEYS = ["owner", "agent", "payee", "capPerPeriod", "perTxCap", "period", "periodStart", "expiry", "spentThisPeriod", "funded", "revoked"]


def canonical(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def decision_hash(record: Any) -> bytes:
    return keccak(text=canonical(record))


def remainder_hash(dh: bytes) -> bytes:
    return keccak(REMAINDER_TAG + dh)


def apply_rules(a: dict, amount: int, *, screen_ok: bool = True, evidence: bool = True, reserve_floor: int = 0, obligations: int = 0) -> tuple[str, Action, int, int]:
    """Deterministic. Returns (rule, action, pay_now, remainder). The LLM never sets an amount."""
    if not screen_ok:
        return "R1_screen", "SCREEN_FAIL", 0, amount
    if not evidence:
        return "R2_no_evidence", "HOLD", 0, 0
    if amount > a["perTxCap"]:
        return "R3_over_per_tx", "ESCALATE", 0, amount
    room = a["capPerPeriod"] - a["spentThisPeriod"]
    liquid = a["funded"] - reserve_floor - obligations
    allowed = min(amount, room, liquid)
    if allowed <= 0:
        return "R4_no_room", "ESCALATE", 0, amount
    if allowed < amount:
        return "R4_partial", "PARTIAL", allowed, amount - allowed
    return "R5_pay", "PAY", amount, 0


@dataclass
class DecideResult:
    action: Action
    rule: str
    pay: int
    remainder: int
    hash: str
    record_tx: str
    pay_tx: Optional[str] = None
    escalate_tx: Optional[str] = None
    remainder_hash: Optional[str] = None
    canonical: str = ""
    record: dict = field(default_factory=dict)


class Steward:
    def __init__(self, allowance_manager: str, audit_log: str, agent_private_key: str,
                 rpc: str = "https://rpc.testnet.arc.io", chain_id: int = ARC_TESTNET_CHAIN_ID):
        self.w3 = Web3(Web3.HTTPProvider(rpc))
        self.chain_id = chain_id
        self.acct = Account.from_key(agent_private_key)
        self.am = self.w3.eth.contract(address=Web3.to_checksum_address(allowance_manager), abi=AM_ABI)
        self.log = self.w3.eth.contract(address=Web3.to_checksum_address(audit_log), abi=LOG_ABI)

    @property
    def address(self) -> str:
        return self.acct.address

    def allowance(self, allowance_id: int) -> dict:
        return dict(zip(KEYS, self.am.functions.allowances(allowance_id).call()))

    def _send(self, fn) -> str:
        base = self.w3.eth.get_block("latest").get("baseFeePerGas", 0)
        max_fee = max(int(base * 1.25), Web3.to_wei(MIN_FEE_GWEI, "gwei"))
        tx = fn.build_transaction({"from": self.acct.address, "chainId": self.chain_id,
                                   "nonce": self.w3.eth.get_transaction_count(self.acct.address),
                                   "maxFeePerGas": max_fee, "maxPriorityFeePerGas": Web3.to_wei(1, "gwei")})
        tx["gas"] = int(self.w3.eth.estimate_gas(tx) * 1.2)
        h = self.w3.eth.send_raw_transaction(self.acct.sign_transaction(tx).raw_transaction)
        rcpt = self.w3.eth.wait_for_transaction_receipt(h, timeout=90)
        if rcpt.status != 1:
            raise RuntimeError(f"tx reverted {h.hex()}")
        return "0x" + h.hex().removeprefix("0x")

    def decide(self, allowance_id: int, amount: int, memo: str, inputs: dict, *, screen_ok: bool = True, evidence: bool = True,
               reserve_floor: int = 0, obligations: int = 0, reason: Optional[str] = None) -> DecideResult:
        """rules → canonical hash → AuditLog.record() → pay() | escalate(). Every call is recorded, including HOLD."""
        a = self.allowance(allowance_id)
        rule, action, pay, remainder = apply_rules(a, amount, screen_ok=screen_ok, evidence=evidence, reserve_floor=reserve_floor, obligations=obligations)
        record = {"allowanceId": str(allowance_id), "requested": str(amount), "amount": str(pay), "remainder": str(remainder), "action": action,
                  "rule": rule, "memo": memo, "reason": reason or f"{rule}: {action} by policy", "inputs": inputs,
                  "blockNumber": str(self.w3.eth.block_number)}
        dh = decision_hash(record)
        res = DecideResult(action=action, rule=rule, pay=pay, remainder=remainder, hash="0x" + dh.hex(), record_tx="", canonical=canonical(record), record=record)
        res.record_tx = self._send(self.log.functions.record(allowance_id, dh, ACTION_CODE[action], pay))
        if action in ("PAY", "PARTIAL"):
            res.pay_tx = self._send(self.am.functions.pay(allowance_id, pay, dh, memo[:60]))
        if remainder > 0:
            rh = remainder_hash(dh) if action == "PARTIAL" else dh
            res.remainder_hash = "0x" + rh.hex()
            res.escalate_tx = self._send(self.am.functions.escalate(allowance_id, remainder, rh, record["reason"][:200]))
        return res
