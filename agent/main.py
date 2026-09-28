"""STEWARD agent: three asyncio loops — signals (60 s), decide (5 min), treasury (6 h)."""
import asyncio
import logging

import httpx

import chain
import db
import notify
import screen
from config import API_BASE, API_SECRET, DECIDE_EVERY, LLM, RESERVE_FLOOR, SIGNALS_EVERY
from decision import ACTION_CODE, DecisionInput, canonical_json, decide, decision_hash, remainder_hash

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("steward.agent")
_H = {"X-Agent-Key": API_SECRET}


async def loop_signals():
    while True:
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get(f"{API_BASE}/milestones/pending", headers=_H)
                r.raise_for_status()
                db.cache_pending(r.json())
            db.refresh_signals()
        except Exception as e:  # keep the loop alive; the decide loop just sees stale data
            log.warning("signals: %s", e)
        await asyncio.sleep(SIGNALS_EVERY)


def _decide_one(m: dict):
    a = chain.get_allowance(m["allowance_id"])
    i = DecisionInput(
        allowance_id=m["allowance_id"], milestone_id=m["id"], payee=a["payee"],
        requested=m["amount"], per_tx_cap=a["perTxCap"], period_cap=a["capPerPeriod"],
        spent_this_period=a["spentThisPeriod"], funded=a["funded"], reserve_floor=RESERVE_FLOOR,
        obligations_next_7d=db.obligations_next_7d(m["allowance_id"], exclude_milestone=m["id"]),
        payee_streak=db.streak(a["payee"]), payee_late=db.late(a["payee"]),
        payee_screen=screen.screen(a["payee"]), evidence_present=bool(m.get("evidence_url")),
        evidence_hash=m.get("evidence_hash", ""), block_number=chain.w3.eth.block_number,
    )
    d = decide(i, use_llm=LLM != "none")
    dh = decision_hash(d)
    rec = {"hash": "0x" + dh.hex(), "milestone_id": m["id"], "allowance_id": i.allowance_id, "action": d.action,
           "amount": d.amount, "remainder": d.remainder, "rule": d.rule, "reason": d.reason, "source": d.source,
           "canonical": canonical_json(d), "timing": d.timing}
    log.info("decision %s %s amount=%.2f remainder=%.2f rule=%s", rec["hash"][:10], d.action, d.amount / 1e6, d.remainder / 1e6, d.rule)

    rec["record_tx"], _ = chain.record(i.allowance_id, dh, ACTION_CODE[d.action], d.amount)   # every cycle, including HOLD
    if d.action in ("PAY", "PARTIAL") and d.timing == "now":
        rec["pay_tx"], rec["pay_block"] = chain.pay(i.allowance_id, d.amount, dh, m["title"][:60])
    if d.action in ("ESCALATE", "PARTIAL", "SCREEN_FAIL"):
        # A PARTIAL's pay() already consumed dh in usedDecision, so its remainder is keyed by a derived hash the owner's
        # approveAndPay() can consume exactly once. ESCALATE / SCREEN_FAIL moved nothing, so they keep dh itself.
        eh = remainder_hash(dh) if d.action == "PARTIAL" else dh
        rec["escalation_hash"] = "0x" + eh.hex()
        rec["escalate_tx"], _ = chain.escalate(i.allowance_id, d.remainder, eh, d.reason)
    db.save_decision(rec)
    return d, dh


async def loop_decide():
    await asyncio.sleep(5)   # let signals fill once
    while True:
        for m in db.pending():
            try:
                d, dh = _decide_one(m)
                if d.action in ("ESCALATE", "PARTIAL", "SCREEN_FAIL"):
                    await notify.escalation(m, d, "0x" + dh.hex())
                if d.action == "HOLD":
                    await notify.hold(m, d)
            except Exception as e:
                log.exception("decide milestone=%s failed: %s", m.get("id"), e)
                try:
                    db.mark_error(m["id"], str(e))
                except Exception:
                    pass
        db.cache_pending([])   # everything seen this cycle has a decision (or an error); wait for fresh signals
        await asyncio.sleep(DECIDE_EVERY)


async def loop_treasury():
    while True:
        # ADAPT Day 6: compute idle = funded - floor - obligations; call YieldSweeper.sweep/redeem; log SWEEP/REDEEM via chain.record
        await asyncio.sleep(6 * 3600)


async def main():
    log.info("agent %s signer=%s rpc=%s api=%s llm=%s", chain.agent_address(), chain.SIGNER, chain.RPC, API_BASE, LLM)
    await asyncio.gather(loop_signals(), loop_decide(), loop_treasury())


if __name__ == "__main__":
    asyncio.run(main())
