"""Unit tests for the rules engine and canonical hashing. Run: cd agent && .venv/bin/python -m unittest -v"""
import json
import os
import unittest

os.environ.setdefault("ALLOWANCE_MANAGER", "0x" + "0" * 40)
os.environ.setdefault("AUDIT_LOG", "0x" + "0" * 40)
os.environ.setdefault("SIGNER", "circle")

from decision import (REASON_SCHEMA, DecisionInput, apply_rules, canonical_json, decide, decision_hash,  # noqa: E402
                      remainder_hash)
from jsonschema import ValidationError, validate  # noqa: E402

ONE = 1_000_000


def inp(**kw) -> DecisionInput:
    base = dict(allowance_id=0, milestone_id="m1", payee="0x90F79bf6EB2c4f870365E785982E1f101E93b906",
                requested=150 * ONE, per_tx_cap=200 * ONE, period_cap=800 * ONE, spent_this_period=0,
                funded=500 * ONE, reserve_floor=100 * ONE, obligations_next_7d=0, payee_streak=0, payee_late=0,
                payee_screen="clear", evidence_present=True, evidence_hash="0xabc", block_number=1)
    base.update(kw)
    return DecisionInput(**base)


class Rules(unittest.TestCase):
    def test_r5_pay(self):
        self.assertEqual(apply_rules(inp()), ("R5_pay", "PAY", 150 * ONE, 0))

    def test_r1_screen_beats_everything(self):
        self.assertEqual(apply_rules(inp(payee_screen="denylist", evidence_present=False)), ("R1_screen", "SCREEN_FAIL", 0, 150 * ONE))

    def test_r2_hold_without_evidence(self):
        self.assertEqual(apply_rules(inp(evidence_present=False)), ("R2_no_evidence", "HOLD", 0, 0))

    def test_r3_over_per_tx_escalates_whole_amount(self):
        self.assertEqual(apply_rules(inp(requested=350 * ONE)), ("R3_over_per_tx", "ESCALATE", 0, 350 * ONE))

    def test_r4_partial_from_liquidity(self):
        # 500 funded − 100 floor − 390 obligations = 10 liquid
        self.assertEqual(apply_rules(inp(obligations_next_7d=390 * ONE)), ("R4_partial", "PARTIAL", 10 * ONE, 140 * ONE))

    def test_r4_partial_from_period_room(self):
        self.assertEqual(apply_rules(inp(spent_this_period=700 * ONE)), ("R4_partial", "PARTIAL", 100 * ONE, 50 * ONE))

    def test_r4_no_room_escalates(self):
        self.assertEqual(apply_rules(inp(spent_this_period=800 * ONE)), ("R4_no_room", "ESCALATE", 0, 150 * ONE))

    def test_exactly_per_tx_cap_pays(self):
        self.assertEqual(apply_rules(inp(requested=200 * ONE))[1], "PAY")

    def test_llm_never_changes_amount(self):
        d = decide(inp(), use_llm=False)
        self.assertEqual((d.action, d.amount, d.remainder, d.source, d.timing), ("PAY", 150 * ONE, 0, "rules", "now"))

    def test_crosschain_pay_becomes_owner_escalation(self):
        d = decide(inp(payout_chain="base-sepolia"), use_llm=False)
        self.assertEqual((d.rule, d.action, d.amount, d.remainder), ("R5_pay_xchain", "ESCALATE", 0, 150 * ONE))
        # but the screen still wins, and a hold is still a hold
        self.assertEqual(decide(inp(payout_chain="base-sepolia", payee_screen="denylist"), use_llm=False).action, "SCREEN_FAIL")
        self.assertEqual(decide(inp(payout_chain="base-sepolia", evidence_present=False), use_llm=False).action, "HOLD")


class Hashing(unittest.TestCase):
    def test_canonical_is_sorted_and_compact(self):
        d = decide(inp(), use_llm=False)
        c = canonical_json(d)
        self.assertEqual(c, json.dumps(json.loads(c), sort_keys=True, separators=(",", ":"), ensure_ascii=False))
        self.assertNotIn(" ", c.split('"reason"')[0])

    def test_hash_is_32_bytes_and_deterministic(self):
        a, b = decide(inp(), use_llm=False), decide(inp(), use_llm=False)
        self.assertEqual(len(decision_hash(a)), 32)
        self.assertEqual(decision_hash(a), decision_hash(b))

    def test_hash_changes_with_any_input(self):
        self.assertNotEqual(decision_hash(decide(inp(), use_llm=False)), decision_hash(decide(inp(block_number=2), use_llm=False)))

    def test_remainder_hash_differs_and_is_deterministic(self):
        dh = decision_hash(decide(inp(), use_llm=False))
        self.assertNotEqual(remainder_hash(dh), dh)
        self.assertEqual(remainder_hash(dh), remainder_hash(dh))
        self.assertEqual(len(remainder_hash(dh)), 32)


class Schema(unittest.TestCase):
    def test_reason_schema_accepts_good(self):
        validate({"reason": "Milestone evidence present, within caps.", "timing": "now"}, REASON_SCHEMA)

    def test_reason_schema_rejects_extra_and_bad_timing(self):
        with self.assertRaises(ValidationError):
            validate({"reason": "x" * 20, "timing": "tomorrow"}, REASON_SCHEMA)
        with self.assertRaises(ValidationError):
            validate({"reason": "x" * 20, "timing": "now", "amount": 5}, REASON_SCHEMA)


if __name__ == "__main__":
    unittest.main()
