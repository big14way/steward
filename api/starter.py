"""Starter credit: a new business gets test USDC in one click, sent from STEWARD's sponsor wallet.

Circle's faucet API (POST /v1/faucet/drips) only works for Circle accounts upgraded to mainnet, so a sponsor Circle wallet
stands in for it. The operator tops the sponsor up from faucet.circle.com. Each workspace can claim once, the launch workspace
never, and at most STARTER_DAILY_MAX claims go out per UTC day.
"""
import os
import time

import db

FEE_MARGIN = 50_000   # 0.05 USDC stays in the sponsor wallet for its own network fees


def amount() -> int:
    return int(os.getenv("STARTER_CREDIT", "5000000"))


def daily_max() -> int:
    return int(os.getenv("STARTER_DAILY_MAX", "10"))


def sponsor() -> tuple[str, str]:
    return os.getenv("SPONSOR_WALLET_ID", ""), os.getenv("SPONSOR_ADDRESS", "")


def init() -> None:
    with db.conn() as c:
        cols = {r[1] for r in c.execute("PRAGMA table_info(workspaces)")}
        if "starter_claimed_at" not in cols:
            c.execute("ALTER TABLE workspaces ADD COLUMN starter_claimed_at INT")
        if "starter_tx" not in cols:
            c.execute("ALTER TABLE workspaces ADD COLUMN starter_tx TEXT")


def _row(ws_id: int):
    with db.conn() as c:
        return c.execute("SELECT starter_claimed_at, starter_tx FROM workspaces WHERE id=?", (ws_id,)).fetchone()


def claims_today() -> int:
    day_start = int(time.time()) // 86400 * 86400
    with db.conn() as c:
        return c.execute("SELECT COUNT(*) FROM workspaces WHERE starter_claimed_at >= ?", (day_start,)).fetchone()[0]


def status(ws_id: int, role: str, sponsor_balance) -> dict:
    """What the dashboard shows. `sponsor_balance` is a callable so the chain is only read when it matters."""
    row = _row(ws_id)
    claimed = bool(row and row["starter_claimed_at"])
    out = {"available": False, "amount": amount(), "claimed": claimed, "tx": row["starter_tx"] if row else None, "reason": ""}
    wallet_id, address = sponsor()
    if claimed:
        out["reason"] = "already claimed"
    elif role != "owner":
        out["reason"] = "owners only"
    elif ws_id == 1:
        out["reason"] = "not for the launch workspace"
    elif not wallet_id or not address:
        out["reason"] = "not set up on this deployment"
    elif claims_today() >= daily_max():
        out["reason"] = "today's starter credits are used up"
    else:
        try:
            ok = sponsor_balance(address) >= amount() + FEE_MARGIN
        except Exception:
            ok = False
        out["available"], out["reason"] = ok, "" if ok else "the sponsor wallet needs a top-up"
    return out


def claim(ws_id: int) -> bool:
    """Atomically mark the workspace as claimed. False if it already was."""
    with db.conn() as c:
        cur = c.execute("UPDATE workspaces SET starter_claimed_at=? WHERE id=? AND starter_claimed_at IS NULL", (int(time.time()), ws_id))
        return cur.rowcount == 1


def release(ws_id: int) -> None:
    with db.conn() as c:
        c.execute("UPDATE workspaces SET starter_claimed_at=NULL, starter_tx=NULL WHERE id=?", (ws_id,))


def record(ws_id: int, tx: str) -> None:
    with db.conn() as c:
        c.execute("UPDATE workspaces SET starter_tx=? WHERE id=?", (tx, ws_id))
