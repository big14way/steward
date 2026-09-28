"""rules → LLM reason → schema → canonical hash. The LLM never sets an amount."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Literal, Optional

from eth_utils import keccak
from jsonschema import ValidationError, validate

Action = Literal["HOLD", "PAY", "PARTIAL", "ESCALATE", "SCREEN_FAIL"]
ACTION_CODE = {"HOLD": 0, "PAY": 1, "PARTIAL": 2, "ESCALATE": 3, "SWEEP": 4, "REDEEM": 5, "SCREEN_FAIL": 6}


@dataclass
class DecisionInput:
    allowance_id: int
    milestone_id: str
    payee: str
    requested: int            # 6 dp
    per_tx_cap: int
    period_cap: int
    spent_this_period: int
    funded: int
    reserve_floor: int
    obligations_next_7d: int
    payee_streak: int
    payee_late: int
    payee_screen: str         # "clear" | "denylist" | "circle_blocked" | "unknown"
    evidence_present: bool
    evidence_hash: str
    block_number: int
    payout_chain: str = "arc"   # "arc" | "base-sepolia" (CCTP V2 payout, owner-executed)


@dataclass
class Decision:
    inputs: DecisionInput
    rule: str
    action: Action
    amount: int               # amount to pay now (6 dp), 0 if none
    remainder: int            # escalated remainder if PARTIAL / ESCALATE / SCREEN_FAIL
    reason: str
    timing: Literal["now", "batch_friday"]
    source: Literal["rules", "llm"]


REASON_SCHEMA = {
    "type": "object",
    "properties": {
        "reason": {"type": "string", "minLength": 10, "maxLength": 400},
        "timing": {"type": "string", "enum": ["now", "batch_friday"]},
    },
    "required": ["reason", "timing"],
    "additionalProperties": False,
}


def apply_rules(i: DecisionInput) -> tuple[str, Action, int, int]:
    """Deterministic. Returns (rule, action, amount_now, remainder)."""
    if i.payee_screen != "clear":
        return "R1_screen", "SCREEN_FAIL", 0, i.requested
    if not i.evidence_present:
        return "R2_no_evidence", "HOLD", 0, 0
    if i.requested > i.per_tx_cap:
        return "R3_over_per_tx", "ESCALATE", 0, i.requested
    period_room = i.period_cap - i.spent_this_period
    liquid_room = max(i.funded - i.reserve_floor - i.obligations_next_7d, 0)
    allowed = min(i.requested, period_room, liquid_room)
    if allowed <= 0:
        return "R4_no_room", "ESCALATE", 0, i.requested
    if allowed < i.requested:
        return "R4_partial", "PARTIAL", allowed, i.requested - allowed
    return "R5_pay", "PAY", i.requested, 0


def llm_reason(i: DecisionInput, rule: str, action: str, amount: int, remainder: int) -> Optional[dict]:
    """Returns a dict matching REASON_SCHEMA or None (caller falls back to a rules-only reason)."""
    from llm import complete_json

    prompt = (
        "You are the reasoning module of a treasury agent. The rules engine already decided. "
        "Write a concise reason a human auditor would accept, and choose timing: 'now' or 'batch_friday' "
        "(batch only if paying now would leave less than 20% headroom of period cap and the payee streak >= 3).\n"
        f"Decision: rule={rule} action={action} amount={amount/1e6:.2f} remainder={remainder/1e6:.2f} USDC\n"
        f"Inputs: {json.dumps(asdict(i))}\n"
        'Return JSON only: {"reason": "...", "timing": "now"|"batch_friday"}'
    )
    out = complete_json(prompt)
    try:
        validate(out, REASON_SCHEMA)
        return out
    except (ValidationError, TypeError):
        return None


def decide(i: DecisionInput, use_llm: bool = True) -> Decision:
    rule, action, amount, remainder = apply_rules(i)
    if i.payout_chain != "arc" and action in ("PAY", "PARTIAL"):
        # A cross-chain payout (CCTP V2 burn on Arc → mint on Base Sepolia) bypasses AllowanceManager caps, so it is
        # never executed by the agent: the rules still run (screen, evidence, caps), and an in-policy result becomes an
        # owner-executed escalation. The owner's approval runs the burn/mint from the owner wallet (api/cctp.py).
        rule, action, amount, remainder = rule + "_xchain", "ESCALATE", 0, i.requested
    llm = llm_reason(i, rule, action, amount, remainder) if use_llm else None
    if llm:
        return Decision(i, rule, action, amount, remainder, llm["reason"], llm["timing"], "llm")
    return Decision(i, rule, action, amount, remainder, f"{rule}: {action} {amount/1e6:.2f} USDC by policy", "now", "rules")


def canonical_json(d: Decision) -> str:
    payload = {"inputs": asdict(d.inputs), "rule": d.rule, "action": d.action, "amount": d.amount,
               "remainder": d.remainder, "reason": d.reason, "timing": d.timing, "source": d.source}
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def decision_hash(d: Decision) -> bytes:
    return keccak(text=canonical_json(d))   # 32 bytes → bytes32 on-chain


REMAINDER_TAG = b"STEWARD/remainder"


def remainder_hash(dh: bytes) -> bytes:
    """Key for the escalated remainder of a PARTIAL. pay() consumed `dh`; approveAndPay() consumes this one.
    Deterministic from the decision hash, so an auditor can derive it and it still pays exactly once."""
    return keccak(REMAINDER_TAG + dh)
