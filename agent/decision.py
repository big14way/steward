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


_USDC_FIELDS = ("requested", "per_tx_cap", "period_cap", "spent_this_period", "funded", "reserve_floor", "obligations_next_7d")


def _inputs_for_model(i: DecisionInput) -> dict:
    """The decision inputs with 6-decimal integer amounts shown as USDC, so the model never misreads units."""
    d = asdict(i)
    for k in _USDC_FIELDS:
        d[k] = f"{d[k] / 1e6:.2f} USDC"
    return d


def llm_reason(i: DecisionInput, rule: str, action: str, amount: int, remainder: int) -> Optional[dict]:
    """Returns a dict matching REASON_SCHEMA or None (caller falls back to a rules-only reason)."""
    from llm import complete_json

    prompt = (
        "You are the reasoning module of a treasury agent. The rules engine already decided. "
        "Write a concise reason a human auditor would accept, and choose timing: 'now' or 'batch_friday' "
        "(batch only if paying now would leave less than 20% headroom of period cap and the payee streak >= 3).\n"
        f"Decision: rule={rule} action={action} amount={amount/1e6:.2f} remainder={remainder/1e6:.2f} USDC\n"
        f"Inputs (USDC amounts already converted): {json.dumps(_inputs_for_model(i))}\n"
        "Write at most two short, plain sentences (under 250 characters in total) for the business owner and the contractor: "
        "what was requested and why this outcome, with amounts in USDC. No rule codes, no field names.\n"
        'Return JSON only: {"reason": "...", "timing": "now"|"batch_friday"}'
    )
    out = complete_json(prompt)
    if isinstance(out, dict) and isinstance(out.get("reason"), str) and len(out["reason"]) > 400:
        cut = out["reason"][:400]                        # keep whole sentences rather than discard a long reason
        end = cut.rfind(". ")
        out["reason"] = cut[: end + 1] if end > 60 else cut[:397].rstrip() + "…"
    try:
        validate(out, REASON_SCHEMA)
        return out
    except (ValidationError, TypeError):
        return None


def rules_reason(i: DecisionInput, rule: str, action: str, amount: int, remainder: int) -> str:
    """Human-readable fallback reason (used when no LLM is configured or its output fails validation).
    Says what was checked and what the numbers were, so an owner or auditor can follow it without the rule codes."""
    u = lambda v: f"{v/1e6:.2f} USDC"
    room = i.period_cap - i.spent_this_period
    liquid = max(i.funded - i.reserve_floor - i.obligations_next_7d, 0)
    base = rule.replace("_xchain", "")
    if base == "R1_screen":
        text = f"Payee failed screening ({i.payee_screen}). Nothing was paid and this request cannot be approved."
    elif base == "R2_no_evidence":
        text = "No link to the work was attached, so the request is on hold. Add evidence and submit again."
    elif base == "R3_over_per_tx":
        text = f"Requested {u(i.requested)}, above the {u(i.per_tx_cap)} per-payment cap. Sent to the owner to approve."
    elif base == "R4_no_room":
        why = f"only {u(room)} of the period budget is left" if room < liquid else f"only {u(liquid)} is available after the reserve floor and other open requests"
        text = f"Requested {u(i.requested)} but {why}. Sent to the owner to approve."
    elif rule.endswith("_xchain"):
        # in-policy, but the payout happens on another chain, which only the owner's wallet can execute
        allowed = min(i.requested, room, liquid)
        fit = f"{u(allowed)} of {u(i.requested)} fits the budget" if allowed < i.requested else f"{u(i.requested)} is within the caps"
        text = f"{fit}, but payout on {i.payout_chain} is executed by the owner's wallet (CCTP). Sent to the owner to approve."
    elif base == "R4_partial":
        text = f"Requested {u(i.requested)}; {u(amount)} fits the budget and was paid now, the remaining {u(remainder)} needs the owner's approval."
    else:
        text = f"Within policy: evidence attached, {u(i.requested)} is under the {u(i.per_tx_cap)} per-payment cap and the {u(room)} left this period. Paid."
    return text


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
    return Decision(i, rule, action, amount, remainder, rules_reason(i, rule, action, amount, remainder), "now", "rules")


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
