"""Owner accounts and sessions.

A business signs in with email + password and gets an HttpOnly session cookie; every owner page and owner read needs it.
Roles: `owner` (everything) and `demo` (view, approve and decline; never create, fund, revoke or move reserve).
Machine callers keep their secrets: the agent sends X-Agent-Key = API_SECRET; scripts may send the owner secret.
Contractors never sign in: their private link is a single-purpose credential for their own page (the magic-link pattern).
"""
import hashlib
import hmac
import os
import secrets
import time

from fastapi import HTTPException, Request, Response

import db

COOKIE = "steward_session"
TTL = 7 * 86400
DEMO_EMAIL = "demo@acmestudio.example"
_attempts: dict[str, list[float]] = {}


def _scrypt(pw: str, salt: bytes) -> bytes:
    return hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    return salt.hex() + ":" + _scrypt(pw, salt).hex()


def check_password(pw: str, stored: str) -> bool:
    try:
        salt, h = stored.split(":")
        return hmac.compare_digest(_scrypt(pw, bytes.fromhex(salt)).hex(), h)
    except ValueError:
        return False


def init() -> None:
    with db.conn() as c:
        c.execute("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, name TEXT, workspace TEXT,"
                  " pw_hash TEXT, role TEXT, created_at INT)")
        c.execute("CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INT, expires_at INT, created_at INT)")
        # Each business is a workspace with its own Circle owner wallet. Workspace 1 is the launch workspace (env owner wallet).
        c.execute("CREATE TABLE IF NOT EXISTS workspaces(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, owner_wallet_id TEXT,"
                  " owner_address TEXT, created_at INT)")
        if not c.execute("SELECT 1 FROM workspaces WHERE id=1").fetchone():
            c.execute("INSERT INTO workspaces(id,name,owner_wallet_id,owner_address,created_at) VALUES(1,?,?,?,?)",
                      (os.getenv("WORKSPACE_NAME", "Acme Studio"), os.getenv("OWNER_WALLET_ID", ""), os.getenv("OWNER_ADDRESS", ""), int(time.time())))
        for table in ("users", "contractors"):
            cols = {r[1] for r in c.execute(f"PRAGMA table_info({table})")}
            if cols and "workspace_id" not in cols:
                c.execute(f"ALTER TABLE {table} ADD COLUMN workspace_id INT DEFAULT 1")
        email, pw = os.getenv("OWNER_EMAIL", "").strip().lower(), os.getenv("OWNER_PASSWORD", "")
        ws = os.getenv("WORKSPACE_NAME", "Acme Studio")
        if email and pw:
            row = c.execute("SELECT id, pw_hash FROM users WHERE email=?", (email,)).fetchone()
            if not row:
                c.execute("INSERT INTO users(email,name,workspace,pw_hash,role,created_at) VALUES(?,?,?,?,?,?)",
                          (email, os.getenv("OWNER_NAME", "Finance"), ws, hash_password(pw), "owner", int(time.time())))
            elif not check_password(pw, row["pw_hash"]):   # the env is the source of truth for the owner password
                c.execute("UPDATE users SET pw_hash=? WHERE id=?", (hash_password(pw), row["id"]))
        if not c.execute("SELECT 1 FROM users WHERE email=?", (DEMO_EMAIL,)).fetchone():
            c.execute("INSERT INTO users(email,name,workspace,pw_hash,role,created_at) VALUES(?,?,?,?,?,?)",
                      (DEMO_EMAIL, "Demo visitor", ws, "", "demo", int(time.time())))
        c.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))


def _limit(key: str) -> None:
    now = time.time()
    hits = [t for t in _attempts.get(key, []) if now - t < 600]
    if len(hits) >= 10:
        raise HTTPException(429, "Too many sign-in attempts. Try again in a few minutes.")
    hits.append(now)
    _attempts[key] = hits


def _public(u) -> dict:
    return {"email": u["email"], "name": u["name"], "workspace": u["workspace"], "role": u["role"],
            "workspace_id": u["workspace_id"] if "workspace_id" in u.keys() else 1}


def workspace(ws_id: int | None) -> dict:
    """The workspace a caller acts for; machine callers (ws_id None) act for the launch workspace."""
    with db.conn() as c:
        w = c.execute("SELECT * FROM workspaces WHERE id=?", (ws_id or 1,)).fetchone()
    if not w:
        raise HTTPException(404, "workspace not found")
    return dict(w)


def signup(response: Response, request: Request, name: str, business: str, email: str, password: str, create_wallet) -> dict:
    """New business: a workspace with its own Circle owner wallet, an owner account, and a session."""
    email, name, business = email.strip().lower(), name.strip(), business.strip()
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]
    _limit("signup:" + ip)
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Enter a valid work email.")
    if len(password) < 10:
        raise HTTPException(400, "Use a password of at least 10 characters.")
    if not business or not name:
        raise HTTPException(400, "Enter your name and your business name.")
    with db.conn() as c:
        if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(409, "An account with that email already exists. Sign in instead.")
    wallet_id, address = create_wallet(f"{business} owner")
    with db.conn() as c:
        cur = c.execute("INSERT INTO workspaces(name,owner_wallet_id,owner_address,created_at) VALUES(?,?,?,?)",
                        (business[:80], wallet_id, address, int(time.time())))
        ws_id = cur.lastrowid
        cur = c.execute("INSERT INTO users(email,name,workspace,pw_hash,role,created_at,workspace_id) VALUES(?,?,?,?,?,?,?)",
                        (email, name[:80], business[:80], hash_password(password), "owner", int(time.time()), ws_id))
        uid = cur.lastrowid
        u = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    start_session(response, request, uid)
    return _public(u)


def start_session(response: Response, request: Request, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    with db.conn() as c:
        c.execute("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
                  (hashlib.sha256(token.encode()).hexdigest(), user_id, int(time.time()) + TTL, int(time.time())))
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https" or os.getenv("COOKIE_SECURE") == "1"
    response.set_cookie(COOKIE, token, max_age=TTL, httponly=True, samesite="lax", secure=secure, path="/")


def login(response: Response, request: Request, email: str, password: str) -> dict:
    email = email.strip().lower()
    _limit(email)
    _limit(request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0])
    with db.conn() as c:
        u = c.execute("SELECT * FROM users WHERE email=? AND role='owner'", (email,)).fetchone()
    if not u or not u["pw_hash"] or not check_password(password, u["pw_hash"]):
        raise HTTPException(401, "That email and password don't match.")
    start_session(response, request, u["id"])
    return _public(u)


def demo(response: Response, request: Request) -> dict:
    if os.getenv("DEMO_ENABLED", "true").lower() != "true":
        raise HTTPException(404, "The demo is not enabled on this deployment.")
    with db.conn() as c:
        u = c.execute("SELECT * FROM users WHERE email=?", (DEMO_EMAIL,)).fetchone()
    start_session(response, request, u["id"])
    return _public(u)


def logout(response: Response, request: Request) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        with db.conn() as c:
            c.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))
    response.delete_cookie(COOKIE, path="/")


def session_user(request: Request) -> dict | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    with db.conn() as c:
        u = c.execute("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=? AND s.expires_at > ?",
                      (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
    return _public(u) if u else None


def principal(request: Request, secret: str = "") -> dict | None:
    """Who is calling: a signed-in user, or a machine caller holding API_SECRET (owner) / JUDGE_SECRET (demo)."""
    u = session_user(request)
    if u:
        return u
    api_secret, judge = os.environ.get("API_SECRET", ""), os.environ.get("JUDGE_SECRET", "")
    for s in (secret, request.headers.get("x-owner-secret", ""), request.headers.get("x-agent-key", "")):
        if api_secret and s and hmac.compare_digest(s, api_secret):
            return {"email": "api", "name": "API", "workspace": "", "role": "owner", "workspace_id": None}
        if judge and s and hmac.compare_digest(s, judge):
            return {"email": DEMO_EMAIL, "name": "Demo visitor", "workspace": "", "role": "demo", "workspace_id": 1}
    return None


def need(request: Request, secret: str = "", roles: tuple[str, ...] = ("owner",)) -> dict:
    p = principal(request, secret)
    if not p:
        raise HTTPException(401, "Sign in to continue.")
    if p["role"] not in roles:
        raise HTTPException(403, "The demo can view, approve and decline. Adding, funding and ending budgets needs the owner.")
    return p
