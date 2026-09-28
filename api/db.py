"""SQLite store. Single source of truth for milestones, decisions, payers, integrators. /stats is built from here."""
import os
import sqlite3
import time

DB = os.getenv("DB_PATH", "./steward.db")


def conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def init() -> None:
    with conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS milestones(
            id TEXT PRIMARY KEY, allowance_id INT, payee TEXT, title TEXT, amount INT,
            evidence_url TEXT, evidence_hash TEXT, signature TEXT, status TEXT DEFAULT 'pending',
            created_at INT, paid_tx TEXT, paid_block INT, last_error TEXT, attempts INT DEFAULT 0);
        CREATE TABLE IF NOT EXISTS decisions(
            hash TEXT PRIMARY KEY, milestone_id TEXT, allowance_id INT, action TEXT, amount INT,
            remainder INT, rule TEXT, reason TEXT, source TEXT, canonical TEXT, record_tx TEXT, pay_tx TEXT,
            escalate_tx TEXT, approved_tx TEXT, human_agreed INT, created_at INT, timing TEXT DEFAULT 'now',
            escalation_hash TEXT);
        CREATE TABLE IF NOT EXISTS payers(address TEXT PRIMARY KEY, name TEXT, created_at INT);
        CREATE TABLE IF NOT EXISTS integrators(name TEXT PRIMARY KEY, repo TEXT, created_at INT);
        CREATE TABLE IF NOT EXISTS treasury(id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, assets INT, shares INT, tx TEXT, created_at INT);
        """)
        cols = {r[1] for r in c.execute("PRAGMA table_info(decisions)")}
        if "escalation_hash" not in cols:   # migration for DBs created before the PARTIAL remainder-hash fix
            c.execute("ALTER TABLE decisions ADD COLUMN escalation_hash TEXT")


def stats() -> dict:
    """Exactly the README table columns, so the table is a copy-paste."""
    with conn() as c:
        def q(s, *a):
            return c.execute(s, a).fetchone()[0]
        by = {r["action"]: r["n"] for r in c.execute("SELECT action, COUNT(*) n FROM decisions GROUP BY action")}
        esc = q("SELECT COUNT(*) FROM decisions WHERE action IN ('ESCALATE','PARTIAL','SCREEN_FAIL') AND human_agreed IS NOT NULL")
        agreed = q("SELECT COUNT(*) FROM decisions WHERE human_agreed=1")
        paid = q("SELECT COUNT(*) FROM milestones WHERE status IN ('paid','partial')")
        # on-time = a PAY/PARTIAL landed within 24 h of the milestone being submitted
        on_time_den = q("SELECT COUNT(*) FROM decisions d JOIN milestones m ON m.id=d.milestone_id WHERE d.pay_tx IS NOT NULL")
        on_time_num = q("SELECT COUNT(*) FROM decisions d JOIN milestones m ON m.id=d.milestone_id WHERE d.pay_tx IS NOT NULL AND d.created_at - m.created_at <= 86400")
        usdc_paid = q("""SELECT COALESCE(SUM(CASE WHEN pay_tx IS NOT NULL THEN amount ELSE 0 END),0)
                              + COALESCE(SUM(CASE WHEN approved_tx IS NOT NULL THEN remainder ELSE 0 END),0) FROM decisions""")
        swept = q("SELECT COALESCE(SUM(assets),0) FROM treasury WHERE action='SWEEP'")
        return {
            "allowances": q("SELECT COUNT(DISTINCT allowance_id) FROM milestones"),
            "payers": q("SELECT COUNT(*) FROM payers"),
            "contractors": q("SELECT COUNT(DISTINCT payee) FROM milestones"),
            "usdc_paid": usdc_paid / 1e6,
            "decisions": q("SELECT COUNT(*) FROM decisions"),
            "by_action": {k: by.get(k, 0) for k in ("PAY", "PARTIAL", "HOLD", "ESCALATE", "SCREEN_FAIL")},
            "human_agreed_pct": round(100 * agreed / esc, 1) if esc else None,
            "on_time_pct": round(100 * on_time_num / on_time_den, 1) if on_time_den else None,
            "usyc_swept": swept / 1e6,
            "milestones_paid": paid,
            "integrators": q("SELECT COUNT(*) FROM integrators"),
            "updated_at": int(time.time()),
        }


def signals() -> dict:
    """Per-payee streak (consecutive most-recent milestones that got paid) and late (held) counts."""
    out: dict[str, dict] = {}
    with conn() as c:
        payees = [r[0] for r in c.execute("SELECT DISTINCT payee FROM milestones")]
        for p in payees:
            rows = c.execute("SELECT status FROM milestones WHERE payee=? AND status NOT IN ('pending') ORDER BY created_at DESC", (p,)).fetchall()
            streak = 0
            for r in rows:
                if r["status"] in ("paid", "partial"):
                    streak += 1
                else:
                    break
            late = c.execute("SELECT COUNT(*) FROM milestones WHERE payee=? AND status='held'", (p,)).fetchone()[0]
            out[p.lower()] = {"streak": streak, "late": late}
    return out
