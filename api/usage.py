"""Private usage counts: how many people tried STEWARD.

Anonymous by design: a random browser id in a first-party cookie, recorded once per kind of action. No names, emails,
IP addresses or page views are stored. Only the operator (the launch workspace's owner, or the API secret) can read them.
"""
import os
import re
import secrets
import time

from fastapi import Request, Response

import db

COOKIE = "steward_vid"
KINDS = {
    "demo": "Opened the live demo",
    "contractor_view": "Opened a contractor page",
    "contractor_request": "Sent a payment request",
    "signup": "Created a workspace",
}
_ID = re.compile(r"[A-Za-z0-9_-]{16,64}")
# Our own scripts, link unfurlers and crawlers are not people trying the product.
_NOT_A_PERSON = re.compile(r"bot|crawl|spider|preview|headless|playwright|puppeteer|lighthouse|curl|wget|python|httpx|node-fetch|axios|okhttp|go-http", re.I)


def init() -> None:
    with db.conn() as c:
        c.execute("CREATE TABLE IF NOT EXISTS usage(kind TEXT, visitor TEXT, first_at INT, last_at INT, PRIMARY KEY(kind, visitor))")
        c.execute("INSERT OR IGNORE INTO usage(kind, visitor, first_at, last_at) VALUES('_since', '_', ?, ?)", (int(time.time()), int(time.time())))


def _secure(request: Request) -> bool:
    return request.headers.get("x-forwarded-proto", request.url.scheme) == "https" or os.getenv("COOKIE_SECURE") == "1"


def track(request: Request, response: Response, kind: str) -> None:
    """Record that this browser did `kind` (once per browser per kind). Never raises."""
    try:
        ua = request.headers.get("user-agent", "")
        if kind not in KINDS or not ua or _NOT_A_PERSON.search(ua) or request.headers.get("x-steward-internal"):
            return
        vid = request.cookies.get(COOKIE, "")
        if vid.startswith("internal"):
            return
        if not _ID.fullmatch(vid):
            vid = secrets.token_urlsafe(18)
            response.set_cookie(COOKIE, vid, max_age=365 * 86400, httponly=True, samesite="lax", secure=_secure(request), path="/")
        now = int(time.time())
        with db.conn() as c:
            c.execute("INSERT INTO usage(kind, visitor, first_at, last_at) VALUES(?,?,?,?) "
                      "ON CONFLICT(kind, visitor) DO UPDATE SET last_at=excluded.last_at", (kind, vid, now, now))
    except Exception:
        pass


def ignore_browser(request: Request, response: Response) -> None:
    """Stop counting this browser (the operator's own testing) and drop what it already counted."""
    vid = request.cookies.get(COOKIE, "")
    with db.conn() as c:
        if _ID.fullmatch(vid):
            c.execute("DELETE FROM usage WHERE visitor=? AND kind != '_since'", (vid,))
    response.set_cookie(COOKIE, "internal-" + secrets.token_urlsafe(9), max_age=5 * 365 * 86400, httponly=True,
                        samesite="lax", secure=_secure(request), path="/")


def report(request: Request, days: int = 14) -> dict:
    now = int(time.time())
    with db.conn() as c:
        since = c.execute("SELECT first_at FROM usage WHERE kind='_since'").fetchone()["first_at"]
        people = c.execute("SELECT COUNT(DISTINCT visitor) FROM usage WHERE kind != '_since'").fetchone()[0]
        by_kind = {k: c.execute("SELECT COUNT(*) FROM usage WHERE kind=?", (k,)).fetchone()[0] for k in KINDS}
        # Businesses that signed up before counting started still count as people who tried it.
        earlier = c.execute("SELECT COUNT(*) FROM workspaces WHERE id > 1 AND created_at < ?", (since,)).fetchone()[0]
        businesses = c.execute("SELECT COUNT(*) FROM workspaces WHERE id > 1").fetchone()[0]
        active = c.execute(
            "SELECT COUNT(DISTINCT s.user_id) FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE u.role = 'owner' AND COALESCE(u.workspace_id, 1) > 1 AND s.created_at >= ?", (now - 7 * 86400,)).fetchone()[0]
        start = now - days * 86400
        rows = c.execute("SELECT kind, date(first_at, 'unixepoch') AS day, COUNT(*) AS n FROM usage "
                         "WHERE kind != '_since' AND first_at >= ? GROUP BY kind, day ORDER BY day", (start,)).fetchall()
    daily: dict[str, dict[str, int]] = {}
    for r in rows:
        daily.setdefault(r["day"], {k: 0 for k in KINDS})[r["kind"]] = r["n"]
    vid = request.cookies.get(COOKIE, "")
    return {
        "since": since,
        "people_tried": people + earlier,
        "by_kind": [{"kind": k, "label": KINDS[k], "count": by_kind[k]} for k in KINDS],
        "businesses_signed_up": businesses,
        "businesses_active_7d": active,
        "daily": [{"day": d, **v} for d, v in sorted(daily.items())],
        "this_browser_ignored": vid.startswith("internal"),
    }
