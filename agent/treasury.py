"""Treasury loop (Day 6): park idle USDC in the 4626 vault (USYC Teller adapter or MockUSYC) between pay cycles.

idle = sweeper USDC balance − reserveFloor − obligations
obligations = pending milestones + open escalation remainders (what we may have to pay soon)

- idle ≥ SWEEP_MIN               → YieldSweeper.sweep(obligations)   → AuditLog SWEEP
- balance < floor + obligations   → YieldSweeper.redeem(shares needed) → AuditLog REDEEM
Every action is hashed (canonical JSON) and recorded on-chain under the treasury sentinel allowance id, then posted to
the API so /stats and the dashboard can show it. Run once: `python treasury.py`.
"""
import json
import logging
import time

import httpx
from eth_utils import keccak

import chain
import db
from config import API_BASE, API_SECRET, SWEEP_MIN
from decision import ACTION_CODE

log = logging.getLogger("steward.treasury")
TREASURY_ID = 2**256 - 1   # AuditLog allowanceId sentinel for treasury events
_H = {"X-Agent-Key": API_SECRET}


def obligations() -> int:
    with httpx.Client(timeout=20) as c:
        pend = c.get(f"{API_BASE}/milestones", params={"status": "pending", "limit": 1000}).json()
        esc = c.get(f"{API_BASE}/escalations").json()
    return sum(m["amount"] for m in pend) + sum(e["remainder"] for e in esc if e["action"] != "SCREEN_FAIL")


def _canonical(kind: str, st: dict, obl: int, assets: int, block: int) -> str:
    return json.dumps({"kind": kind, "balance": st["balance"], "floor": st["floor"], "obligations": obl,
                       "shares_before": st["shares"], "assets": assets, "block": block}, sort_keys=True, separators=(",", ":"))


def cycle() -> dict | None:
    if chain.SWEEPER is None:
        log.info("no YIELD_SWEEPER configured; treasury loop idle")
        return None
    st = chain.treasury_state()
    obl = obligations()
    keep = st["floor"] + obl
    idle = st["balance"] - keep
    block = chain.w3.eth.block_number
    log.info("treasury balance=%.2f floor=%.2f obligations=%.2f idle=%.2f shares=%s position=%.2f",
             st["balance"] / 1e6, st["floor"] / 1e6, obl / 1e6, idle / 1e6, st["shares"], st["position_assets"] / 1e6)

    if idle >= SWEEP_MIN:
        canon = _canonical("SWEEP", st, obl, idle, block)
        dh = keccak(text=canon)
        tx, _ = chain.sweep(obl)
        after = chain.treasury_state()
        shares = after["shares"] - st["shares"]
        rec_tx, _ = chain.record(TREASURY_ID, dh, ACTION_CODE["SWEEP"], idle)
        ev = {"action": "SWEEP", "assets": idle, "shares": shares, "tx": tx, "hash": "0x" + dh.hex(), "record_tx": rec_tx,
              "bal_after": after["balance"], "obligations": obl, "canonical": canon}
    elif st["balance"] < keep and st["shares"] > 0:
        needed = keep - st["balance"]
        shares = min(st["shares"], chain.VAULT.functions.convertToShares(needed).call() + 1)
        canon = _canonical("REDEEM", st, obl, needed, block)
        dh = keccak(text=canon)
        tx, _ = chain.redeem(shares)
        after = chain.treasury_state()
        got = after["balance"] - st["balance"]
        rec_tx, _ = chain.record(TREASURY_ID, dh, ACTION_CODE["REDEEM"], got)
        ev = {"action": "REDEEM", "assets": got, "shares": shares, "tx": tx, "hash": "0x" + dh.hex(), "record_tx": rec_tx,
              "bal_after": after["balance"], "obligations": obl, "canonical": canon}
    else:
        return None

    with httpx.Client(timeout=30) as c:
        c.post(f"{API_BASE}/treasury", json=ev, headers=_H).raise_for_status()
    log.info("%s %.2f USDC (%s shares) tx=%s", ev["action"], ev["assets"] / 1e6, ev["shares"], ev["tx"][:12])
    return ev


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    print(json.dumps(cycle(), indent=2, default=str))
