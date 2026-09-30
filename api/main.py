"""STEWARD API — FastAPI + SQLite. Contractors submit EIP-712 milestones; the agent polls and posts decisions;
owners approve escalations and create allowances through the owner signer (Circle wallet or local fallback)."""
import hashlib
import json
import os
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

from eth_account import Account  # noqa: E402
from eth_account.messages import encode_typed_data  # noqa: E402
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from web3 import Web3  # noqa: E402

import auth  # noqa: E402
import circle_webhook_verify  # noqa: E402
import db  # noqa: E402
import signer  # noqa: E402
import usage  # noqa: E402

app = FastAPI(title="STEWARD API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
db.init()
auth.init()
usage.init()

w3 = signer.w3
CHAIN_ID = signer.CHAIN_ID
AM_ADDR = Web3.to_checksum_address(os.environ["ALLOWANCE_MANAGER"])
AM = w3.eth.contract(address=AM_ADDR, abi=signer.abi("AllowanceManager"))
KEYS = ["owner", "agent", "payee", "capPerPeriod", "perTxCap", "period", "periodStart", "expiry", "spentThisPeriod", "funded", "revoked"]
EXPLORER = os.getenv("EXPLORER", "https://explorer.testnet.arc.io")


def agent_auth(x_agent_key: str = Header(default="")):
    if not os.environ.get("API_SECRET") or x_agent_key != os.environ["API_SECRET"]:
        raise HTTPException(401)


def viewer(request: Request):
    """Owner pages and owner reads: a signed-in owner or demo session, or a machine caller with the API secret."""
    return auth.need(request, roles=("owner", "demo"))


def _scope(p: dict) -> set[int] | None:
    """Allowance ids a caller may see. None = everything (machine callers). The launch workspace (1) also owns the
    allowances created before workspaces existed, i.e. every allowance that no other workspace's contractor uses."""
    ws = p.get("workspace_id")
    if ws is None:
        return None
    with db.conn() as c:
        if ws != 1:
            return {r[0] for r in c.execute("SELECT allowance_id FROM contractors WHERE workspace_id=?", (ws,))}
        others = {r[0] for r in c.execute("SELECT allowance_id FROM contractors WHERE COALESCE(workspace_id,1)<>1")}
    return set(range(AM.functions.nextId().call())) - others


def _in(ids: set[int] | None) -> tuple[str, list]:
    """SQL fragment restricting allowance_id to `ids` (no restriction for machine callers)."""
    if ids is None:
        return "", []
    return (f" AND allowance_id IN ({','.join('?' * len(ids))})", sorted(ids)) if ids else (" AND 0", [])


def _wallet(p: dict) -> tuple[str | None, str]:
    """(Circle wallet id, address) that signs owner actions for the caller's workspace. None wallet = the env owner wallet."""
    w = auth.workspace(p.get("workspace_id"))
    if w["id"] == 1:
        return None, w["owner_address"] or signer.owner_address()
    return w["owner_wallet_id"], w["owner_address"]


def _ws_of_allowance(allowance_id: int) -> dict:
    with db.conn() as c:
        r = c.execute("SELECT COALESCE(workspace_id,1) FROM contractors WHERE allowance_id=?", (allowance_id,)).fetchone()
    return auth.workspace(r[0] if r else 1)


def _check(p: dict, allowance_id: int):
    ids = _scope(p)
    if ids is not None and allowance_id not in ids:
        raise HTTPException(404, "not found")


# ---- EIP-712 milestone typed data (contractor signs in browser or CLI; server verifies) ----
DOMAIN = {"name": "STEWARD", "version": "1", "chainId": CHAIN_ID, "verifyingContract": AM_ADDR}
TYPES = {"Milestone": [{"name": "allowanceId", "type": "uint256"}, {"name": "title", "type": "string"},
                       {"name": "amount", "type": "uint128"}, {"name": "evidenceHash", "type": "bytes32"},
                       {"name": "nonce", "type": "string"}, {"name": "payoutChain", "type": "string"}]}
PAYOUT_CHAINS = ("arc", "base-sepolia")


def evidence_hash(url: str) -> str:
    return "0x" + hashlib.sha256(url.encode()).hexdigest()


def _allowance(id: int) -> dict:
    return dict(zip(KEYS, AM.functions.allowances(id).call()))


@app.get("/account")
def account(p: dict = Depends(viewer)):
    """Owner account card: USDC balances of the workspace's owner wallet, the agent wallet (gas), and what is locked in budgets + reserve."""
    usdc = w3.eth.contract(address=Web3.to_checksum_address(signer.USDC), abi=signer.ERC20_MIN)
    ws = auth.workspace(p.get("workspace_id"))
    _, owner = _wallet(p)
    agent = os.environ.get("AGENT_ADDRESS")
    ids = _scope(p)
    ids = sorted(ids) if ids is not None else list(range(AM.functions.nextId().call()))
    funded = sum(_allowance(i)["funded"] for i in ids)
    n = len(ids)
    reserve = None
    if os.environ.get("YIELD_SWEEPER") and ws["id"] == 1:
        try:
            reserve = usdc.functions.balanceOf(Web3.to_checksum_address(os.environ["YIELD_SWEEPER"])).call()
        except Exception:
            reserve = None
    return {"owner": owner, "owner_usdc": usdc.functions.balanceOf(Web3.to_checksum_address(owner)).call(),
            "agent": agent, "agent_usdc": usdc.functions.balanceOf(Web3.to_checksum_address(agent)).call() if agent else None,
            "in_budgets": funded, "in_reserve": reserve, "budgets": n, "payer": ws["name"], "workspace_id": ws["id"],
            "telegram": {"connected": bool(ws.get("telegram_chat_id")), "available": bool(os.environ.get("TELEGRAM_BOT_USERNAME"))},
            "faucet": "https://faucet.circle.com", "explorer": EXPLORER}


# ---- Telegram: each workspace links its own chat; approval requests go only there, taps act only for that workspace ----
def _telegram_guard(request: Request, p: dict, owner_ws: dict):
    """A tap in Telegram arrives as the agent (machine key) plus X-Telegram-Chat. It may only act on its own workspace's budgets."""
    chat = request.headers.get("x-telegram-chat")
    if chat is None:
        return
    if not owner_ws.get("telegram_chat_id") or str(owner_ws["telegram_chat_id"]) != str(chat):
        raise HTTPException(403, "This Telegram chat isn't connected to the workspace that owns this budget.")


@app.post("/telegram/link-code")
def telegram_link_code(request: Request):
    """Owner asks for a one-time link: opening it in Telegram and pressing Start connects this workspace's chat."""
    p = auth.need(request)
    bot = os.environ.get("TELEGRAM_BOT_USERNAME", "").lstrip("@")
    if not bot:
        raise HTTPException(503, "Telegram isn't set up on this deployment yet.")
    import secrets as _s
    code = _s.token_hex(4).upper()   # short enough to type: 8 hex characters, valid for 30 minutes
    with db.conn() as c:
        c.execute("DELETE FROM telegram_links WHERE created_at < ?", (int(time.time()) - 1800,))
        c.execute("INSERT INTO telegram_links(code,workspace_id,created_at) VALUES(?,?,?)", (code, p.get("workspace_id") or 1, int(time.time())))
    return {"url": f"https://t.me/{bot}?start={code}", "bot": bot, "code": code}


class TelegramLinkIn(BaseModel):
    code: str
    chat_id: str


@app.post("/telegram/link", dependencies=[Depends(agent_auth)])
def telegram_link(body: TelegramLinkIn):
    """Called by the bot when an owner presses Start on their one-time link."""
    with db.conn() as c:
        row = c.execute("SELECT workspace_id FROM telegram_links WHERE code=? AND created_at > ?", (body.code, int(time.time()) - 1800)).fetchone()
        if not row:
            raise HTTPException(404, "This link has expired. Open your dashboard and connect Telegram again.")
        c.execute("UPDATE workspaces SET telegram_chat_id=? WHERE id=?", (body.chat_id, row[0]))
        c.execute("DELETE FROM telegram_links WHERE code=?", (body.code,))
    return {"workspace": auth.workspace(row[0])["name"]}


@app.get("/telegram/route", dependencies=[Depends(agent_auth)])
def telegram_route(allowance_id: int | None = None):
    """Where the agent should send a message about this budget (None = the launch workspace)."""
    w = _ws_of_allowance(allowance_id) if allowance_id is not None else auth.workspace(1)
    return {"chat_id": w.get("telegram_chat_id"), "workspace": w["name"], "workspace_id": w["id"]}


@app.post("/telegram/unlink")
def telegram_unlink(request: Request):
    p = auth.need(request)
    with db.conn() as c:
        c.execute("UPDATE workspaces SET telegram_chat_id=NULL WHERE id=?", (p.get("workspace_id") or 1,))
    return {"ok": True}


class LoginIn(BaseModel):
    email: str
    password: str


@app.post("/auth/login")
def auth_login(body: LoginIn, request: Request, response: Response):
    return auth.login(response, request, body.email, body.password)


class SignupIn(BaseModel):
    name: str
    business: str
    email: str
    password: str


@app.post("/auth/signup")
def auth_signup(body: SignupIn, request: Request, response: Response):
    """A new business gets a workspace, its own Circle owner wallet on Arc, and a session."""
    if not os.environ.get("CIRCLE_WALLET_SET_ID"):
        raise HTTPException(503, "Sign-up needs Circle wallets configured on this deployment.")
    user = auth.signup(response, request, body.name, body.business, body.email, body.password,
                       lambda label: _create_circle_wallet(label, kind="owner"))
    usage.track(request, response, "signup")
    return user


@app.post("/auth/demo")
def auth_demo(request: Request, response: Response):
    user = auth.demo(response, request)
    usage.track(request, response, "demo")
    return user


@app.post("/auth/logout")
def auth_logout(request: Request, response: Response):
    auth.logout(response, request)
    return {"ok": True}


@app.get("/auth/me")
def auth_me(request: Request):
    p = auth.principal(request)
    if not p:
        raise HTTPException(401, "Sign in to continue.")
    return p


@app.get("/health")
def health():
    return {"ok": True, "chain_id": CHAIN_ID, "block": w3.eth.block_number, "allowance_manager": AM_ADDR,
            "owner_signer": signer.OWNER_SIGNER, "owner": signer.owner_address(), "explorer": EXPLORER}


class MilestoneIn(BaseModel):
    allowance_id: int
    title: str
    amount: int
    evidence_url: str = ""
    nonce: str
    signature: str
    payout_chain: str = "arc"   # "arc" (pay on Arc) | "base-sepolia" (owner-executed CCTP V2 payout); part of the signed data


@app.post("/milestones")
def submit_milestone(m: MilestoneIn):
    if m.payout_chain not in PAYOUT_CHAINS:
        raise HTTPException(400, f"payout_chain must be one of {PAYOUT_CHAINS}")
    a = _allowance(m.allowance_id)
    payee = a["payee"]
    if payee == "0x0000000000000000000000000000000000000000":
        raise HTTPException(404, "no such allowance")
    ev = evidence_hash(m.evidence_url)
    msg = encode_typed_data(domain_data=DOMAIN, message_types=TYPES, message_data={
        "allowanceId": m.allowance_id, "title": m.title, "amount": m.amount, "evidenceHash": ev, "nonce": m.nonce,
        "payoutChain": m.payout_chain})
    try:
        who = Account.recover_message(msg, signature=m.signature)
    except Exception as e:
        raise HTTPException(400, f"bad signature: {e}")
    if who.lower() != payee.lower():
        raise HTTPException(403, "signature is not from the allowance payee")
    mid = str(uuid.uuid4())
    with db.conn() as c:
        if c.execute("SELECT 1 FROM milestones WHERE signature=?", (m.signature,)).fetchone():
            raise HTTPException(409, "milestone already submitted")
        c.execute("INSERT INTO milestones(id,allowance_id,payee,title,amount,evidence_url,evidence_hash,signature,status,created_at,payout_chain) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (mid, m.allowance_id, payee, m.title, m.amount, m.evidence_url, ev, m.signature, "pending", int(time.time()), m.payout_chain))
    return {"id": mid, "status": "pending", "payee": payee, "evidence_hash": ev, "payout_chain": m.payout_chain}


@app.get("/milestones")
def list_milestones(allowance_id: int | None = None, payee: str | None = None, status: str | None = None, limit: int = 200,
                    p: dict = Depends(viewer)):
    frag, args = _in(_scope(p))
    q = "SELECT * FROM milestones WHERE 1=1" + frag
    if allowance_id is not None:
        q += " AND allowance_id=?"; args.append(allowance_id)
    if payee:
        q += " AND lower(payee)=?"; args.append(payee.lower())
    if status:
        q += " AND status=?"; args.append(status)
    q += " ORDER BY created_at DESC LIMIT ?"; args.append(limit)
    with db.conn() as c:
        return [dict(r) for r in c.execute(q, args)]


@app.get("/milestones/pending", dependencies=[Depends(agent_auth)])
def pending():
    with db.conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM milestones WHERE status='pending' AND attempts < 3 ORDER BY created_at")]


class ErrorIn(BaseModel):
    error: str
    at: int


@app.post("/milestones/{id}/error", dependencies=[Depends(agent_auth)])
def milestone_error(id: str, e: ErrorIn):
    with db.conn() as c:
        c.execute("UPDATE milestones SET last_error=?, attempts=attempts+1 WHERE id=?", (e.error, id))
        c.execute("UPDATE milestones SET status='error' WHERE id=? AND attempts>=3 AND status='pending'", (id,))
    return {"ok": True}


@app.get("/signals", dependencies=[Depends(agent_auth)])
def signals():
    return db.signals()


class DecisionIn(BaseModel):
    hash: str
    milestone_id: str
    allowance_id: int
    action: str
    amount: int
    remainder: int
    rule: str
    reason: str
    source: str
    canonical: str
    timing: str = "now"
    record_tx: str | None = None
    pay_tx: str | None = None
    escalate_tx: str | None = None
    pay_block: int | None = None
    escalation_hash: str | None = None   # PARTIAL: keccak("STEWARD/remainder" ‖ hash); ESCALATE/SCREEN_FAIL: = hash


@app.post("/decisions", dependencies=[Depends(agent_auth)])
def save_decision(d: DecisionIn):
    with db.conn() as c:
        c.execute("""INSERT OR REPLACE INTO decisions(hash,milestone_id,allowance_id,action,amount,remainder,rule,reason,source,canonical,
                     record_tx,pay_tx,escalate_tx,approved_tx,human_agreed,created_at,timing,escalation_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (d.hash, d.milestone_id, d.allowance_id, d.action, d.amount, d.remainder, d.rule, d.reason, d.source, d.canonical,
                   d.record_tx, d.pay_tx, d.escalate_tx, None, None, int(time.time()), d.timing, d.escalation_hash))
        if d.action == "PARTIAL" and d.pay_tx:
            c.execute("UPDATE milestones SET status='partial', paid_tx=?, paid_block=? WHERE id=?", (d.pay_tx, d.pay_block, d.milestone_id))
        elif d.pay_tx:
            c.execute("UPDATE milestones SET status='paid', paid_tx=?, paid_block=? WHERE id=?", (d.pay_tx, d.pay_block, d.milestone_id))
        elif d.action == "HOLD":
            c.execute("UPDATE milestones SET status='held' WHERE id=?", (d.milestone_id,))
        elif d.action == "PAY" and d.timing == "batch_friday":
            c.execute("UPDATE milestones SET status='batched' WHERE id=?", (d.milestone_id,))
        else:
            c.execute("UPDATE milestones SET status='escalated' WHERE id=?", (d.milestone_id,))
    return {"ok": True}


@app.get("/decisions")
def list_decisions(allowance_id: int | None = None, action: str | None = None, limit: int = 100, p: dict = Depends(viewer)):
    frag, args = _in(_scope(p))
    q = "SELECT * FROM decisions WHERE 1=1" + frag
    if allowance_id is not None:
        q += " AND allowance_id=?"; args.append(allowance_id)
    if action:
        q += " AND action=?"; args.append(action)
    q += " ORDER BY created_at DESC LIMIT ?"; args.append(limit)
    with db.conn() as c:
        return [dict(r) for r in c.execute(q, args)]


@app.get("/decisions/{hash}")
def get_decision(hash: str, p: dict = Depends(viewer)):
    with db.conn() as c:
        d = c.execute("SELECT * FROM decisions WHERE hash=?", (hash,)).fetchone()
    if not d:
        raise HTTPException(404)
    _check(p, d["allowance_id"])
    out = dict(d)
    out["replay"] = {"canonical": out["canonical"], "keccak256": "0x" + Web3.keccak(text=out["canonical"]).hex().removeprefix("0x"),
                     "matches": ("0x" + Web3.keccak(text=out["canonical"]).hex().removeprefix("0x")).lower() == hash.lower()}
    return out


@app.get("/escalations")
def escalations(p: dict = Depends(viewer)):
    frag, args = _in(_scope(p))
    with db.conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM decisions WHERE action IN ('ESCALATE','PARTIAL','SCREEN_FAIL') AND approved_tx IS NULL"
                                           " AND human_agreed IS NULL" + frag + " ORDER BY created_at DESC", args)]


class ApproveIn(BaseModel):
    owner_secret: str = ""   # machine callers only; the dashboard uses the session cookie


@app.post("/escalations/{hash}/approve")
def approve(hash: str, body: ApproveIn, request: Request):
    p = auth.need(request, body.owner_secret, ("owner", "demo"))
    with db.conn() as c:
        d = c.execute("SELECT * FROM decisions WHERE hash=?", (hash,)).fetchone()
    if not d:
        raise HTTPException(404)
    _check(p, d["allowance_id"])
    owner_ws = _ws_of_allowance(d["allowance_id"])
    _telegram_guard(request, p, owner_ws)
    wallet_id = None if owner_ws["id"] == 1 else owner_ws["owner_wallet_id"]   # the budget's owner signs, whoever taps approve
    if d["action"] == "SCREEN_FAIL":
        raise HTTPException(400, "screen failures cannot be approved")
    if d["approved_tx"]:
        raise HTTPException(409, "already approved")
    with db.conn() as c:
        m = c.execute("SELECT * FROM milestones WHERE id=?", (d["milestone_id"],)).fetchone()
    if m and (m["payout_chain"] or "arc") == "base-sepolia":
        # Cross-chain payout (Day 7): the owner wallet burns on Arc via CCTP V2 and the contractor is minted on Base Sepolia.
        # This bypasses AllowanceManager caps, which is exactly why it only runs with owner authority, here.
        if signer.OWNER_SIGNER != "circle":
            raise HTTPException(400, "cross-chain payout needs Circle Developer-Controlled wallets (OWNER_SIGNER=circle)")
        import cctp
        r = cctp.payout_crosschain(d["remainder"], m["payee"], wallet_id or os.environ["OWNER_WALLET_ID"])
        with db.conn() as c:
            c.execute("UPDATE decisions SET approved_tx=?, mint_tx=?, human_agreed=1 WHERE hash=?", (r["burn_tx"], r["mint_tx"], hash))
            c.execute("UPDATE milestones SET status='paid', paid_tx=? WHERE id=?", (r["mint_tx"], d["milestone_id"]))
        return {"state": "COMPLETE", "txHash": r["burn_tx"], "mint_tx": r["mint_tx"], "chain": "base-sepolia"}
    # approveAndPay pays out of the budget, so check it first and say what to do instead of surfacing a revert.
    a = _allowance(d["allowance_id"])
    if a["revoked"]:
        raise HTTPException(409, "This budget was ended. Nothing can be paid from it.")
    if a["funded"] < d["remainder"]:
        raise HTTPException(409, f"The budget holds {a['funded'] / 1e6:.2f} USDC. Top it up by {(d['remainder'] - a['funded']) / 1e6:.2f} USDC, then approve.")
    # PARTIAL remainders are keyed by their derived escalation hash (the decision hash was consumed by pay()).
    r = signer.owner_approve_and_pay(d["allowance_id"], d["remainder"], d["escalation_hash"] or hash, wallet_id)
    with db.conn() as c:
        c.execute("UPDATE decisions SET approved_tx=?, human_agreed=1 WHERE hash=?", (r["txHash"], hash))
        c.execute("UPDATE milestones SET status='paid', paid_tx=? WHERE id=?", (r["txHash"], d["milestone_id"]))
    return r


@app.post("/escalations/{hash}/reject")
def reject(hash: str, body: ApproveIn, request: Request):
    p = auth.need(request, body.owner_secret, ("owner", "demo"))
    with db.conn() as c:
        d = c.execute("SELECT allowance_id FROM decisions WHERE hash=?", (hash,)).fetchone()
    if not d:
        raise HTTPException(404)
    _check(p, d["allowance_id"])
    _telegram_guard(request, p, _ws_of_allowance(d["allowance_id"]))
    with db.conn() as c:
        c.execute("UPDATE decisions SET human_agreed=0 WHERE hash=?", (hash,))
        c.execute("UPDATE milestones SET status='rejected' WHERE id=(SELECT milestone_id FROM decisions WHERE hash=?)", (hash,))
    return {"ok": True}


class AllowanceIn(BaseModel):
    owner_secret: str = ""   # machine callers only; the dashboard uses the session cookie
    payee: str
    cap_period: int
    per_tx: int
    period: int
    expiry: int = 0
    fund: int = 0
    payer_name: str = ""


@app.post("/allowances")
def create_allowance(a: AllowanceIn, request: Request):
    auth.need(request, a.owner_secret)
    agent_addr = os.environ["AGENT_ADDRESS"]
    r = signer.owner_create(agent_addr, a.payee, a.cap_period, a.per_tx, a.period, a.expiry)
    aid = AM.functions.nextId().call() - 1
    out = {"id": aid, "create_tx": r["txHash"]}
    if a.fund:
        out["fund_tx"] = signer.owner_fund(aid, a.fund)["txHash"]
    with db.conn() as c:
        c.execute("INSERT OR IGNORE INTO payers VALUES(?,?,?)", (signer.owner_address(), a.payer_name or "owner", int(time.time())))
    return out


class FundIn(BaseModel):
    owner_secret: str = ""   # machine callers only; the dashboard uses the session cookie
    amount: int   # 6 dp


@app.post("/allowances/{id}/fund")
def fund_allowance(id: int, body: FundIn, request: Request):
    auth.need(request, body.owner_secret)
    return signer.owner_fund(id, body.amount)


class RevokeIn(BaseModel):
    owner_secret: str = ""   # machine callers only; the dashboard uses the session cookie


@app.post("/allowances/{id}/revoke")
def revoke_allowance(id: int, body: RevokeIn, request: Request):
    auth.need(request, body.owner_secret)
    return signer.owner_revoke(id)


@app.get("/allowances")
def list_allowances(p: dict = Depends(viewer)):
    ids = _scope(p)
    ids = sorted(ids) if ids is not None else range(AM.functions.nextId().call())
    return [{"id": i, **_allowance(i)} for i in ids]


@app.get("/allowances/{id}")
def get_allowance(id: int, p: dict = Depends(viewer)):
    _check(p, id)
    return {"id": id, **_allowance(id)}


@app.get("/stats/workspace")
def workspace_stats(p: dict = Depends(viewer)):
    """The dashboard's numbers for the caller's own workspace (the public /stats is platform-wide)."""
    ids = _scope(p)
    s = db.stats(ids, include_treasury=(p.get("workspace_id") or 1) == 1)
    s["allowances"] = len(ids) if ids is not None else s["allowances"]
    if ids is not None:
        s["contractors"] = len({_allowance(i)["payee"].lower() for i in ids})
    return s


def _operator(request: Request) -> dict:
    """The person running this deployment: the launch workspace's owner (or the API secret). Other businesses and the demo are refused."""
    p = auth.principal(request)
    if not p:
        raise HTTPException(401, "Sign in to continue.")
    if p["role"] != "owner" or p.get("workspace_id") not in (1, None):
        raise HTTPException(403, "Only the operator of this deployment can see usage.")
    return p


@app.get("/stats/usage")
def usage_stats(request: Request):
    """Private: how many people tried STEWARD (anonymous browser counts), for the operator only. Not part of the public /stats."""
    _operator(request)
    return usage.report(request)


@app.post("/stats/usage/ignore-me")
def usage_ignore_me(request: Request, response: Response):
    """Private: stop counting the operator's own browser, and drop what it already counted."""
    _operator(request)
    usage.ignore_browser(request, response)
    return {"ok": True}


@app.get("/stats")
def stats():
    """DB-derived numbers, with allowances / contractors taken from the chain so allowances without milestones yet still count."""
    s = db.stats()
    try:
        n = AM.functions.nextId().call()
        payees = {_allowance(i)["payee"].lower() for i in range(n)}
        s["allowances"], s["contractors"] = n, len(payees)
    except Exception:
        pass   # chain unreachable → keep the DB-derived counts
    return s


class TreasuryIn(BaseModel):
    action: str          # SWEEP | REDEEM
    assets: int
    shares: int
    tx: str
    hash: str
    record_tx: str | None = None
    bal_after: int
    obligations: int
    canonical: str


@app.post("/treasury", dependencies=[Depends(agent_auth)])
def save_treasury(t: TreasuryIn):
    with db.conn() as c:
        c.execute("INSERT INTO treasury(action,assets,shares,tx,created_at,hash,record_tx,bal_after,obligations,canonical) VALUES(?,?,?,?,?,?,?,?,?,?)",
                  (t.action, t.assets, t.shares, t.tx, int(time.time()), t.hash, t.record_tx, t.bal_after, t.obligations, t.canonical))
    return {"ok": True}


@app.get("/treasury")
def list_treasury(limit: int = 100, p: dict = Depends(viewer)):
    _, owner_addr = _wallet(p)
    if (p.get("workspace_id") or 1) != 1:   # new workspaces: their own USYC position; the agent reserve belongs to the launch workspace
        out = {"events": [], "sweeper": None}
        try:
            import usyc
            out["usyc"] = usyc.position(w3, owner_addr)
        except Exception as e:
            out["usyc_error"] = str(e)[:200]
        return out
    with db.conn() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM treasury ORDER BY created_at DESC LIMIT ?", (limit,))]
    out = {"events": rows, "sweeper": os.environ.get("YIELD_SWEEPER")}
    if os.environ.get("YIELD_SWEEPER"):
        try:
            sw = w3.eth.contract(address=Web3.to_checksum_address(os.environ["YIELD_SWEEPER"]), abi=signer.abi("YieldSweeper"))
            vault = w3.eth.contract(address=sw.functions.VAULT().call(), abi=signer.abi("MockUSYC"))
            usdc = w3.eth.contract(address=Web3.to_checksum_address(signer.USDC), abi=signer.ERC20_MIN)
            shares = vault.functions.balanceOf(sw.address).call()
            out.update({"balance": usdc.functions.balanceOf(sw.address).call(), "floor": sw.functions.reserveFloor().call(),
                        "shares": shares, "position_assets": vault.functions.convertToAssets(shares).call() if shares else 0, "vault": vault.address})
        except Exception as e:  # chain unreachable → still return the log
            out["error"] = str(e)[:200]
    try:  # real USYC held by the owner's Circle wallet (allowlisted by Circle)
        import usyc
        out["usyc"] = usyc.position(w3, signer.owner_address())
    except Exception as e:
        out["usyc_error"] = str(e)[:200]
    return out


class UsycIn(BaseModel):
    amount: int = 0          # USDC (6 dp) to move into USYC
    shares: int = 0          # USYC (6 dp) to redeem; 0 with all=True redeems everything
    all: bool = False


def _usyc_event(action: str, assets: int, shares: int, tx: str | None):
    with db.conn() as c:
        c.execute("INSERT INTO treasury(action,assets,shares,tx,created_at,hash,record_tx,bal_after,obligations,canonical) VALUES(?,?,?,?,?,?,?,?,?,?)",
                  (action, assets, shares, tx, int(time.time()), "", None, 0, 0, ""))


@app.post("/treasury/usyc/deposit")
def usyc_deposit(body: UsycIn, request: Request):
    """Owner moves idle USDC from their Circle wallet into USYC through Circle's Teller."""
    p = auth.need(request)
    wallet_id, owner_addr = _wallet(p)
    if signer.OWNER_SIGNER != "circle":
        raise HTTPException(400, "USYC needs the owner's Circle wallet (OWNER_SIGNER=circle)")
    if body.amount <= 0:
        raise HTTPException(400, "Enter an amount of USDC to move into USYC.")
    import usyc
    pos0 = usyc.position(w3, owner_addr)
    if not pos0["allowlisted"]:
        raise HTTPException(403, "USYC needs Circle to allowlist your wallet first.")
    usyc.price_guard(pos0)
    before = pos0["shares"]
    r = usyc.deposit(wallet_id or os.environ["OWNER_WALLET_ID"], owner_addr, body.amount)
    if str(r.get("state", "")).split(".")[-1] not in ("COMPLETE", "CONFIRMED"):
        raise HTTPException(502, f"USYC deposit did not complete: {r.get('errorReason') or r.get('state')}")
    after = usyc.position(w3, owner_addr)
    if (p.get("workspace_id") or 1) == 1:
        _usyc_event("USYC_MINT", body.amount, max(after["shares"] - before, 0), r.get("txHash"))
    return {"txHash": r.get("txHash"), "usyc": after}


@app.post("/treasury/usyc/redeem")
def usyc_redeem(body: UsycIn, request: Request):
    """Owner redeems USYC back to USDC in their Circle wallet (for example to top up a contractor's budget)."""
    p = auth.need(request)
    wallet_id, owner_addr = _wallet(p)
    import usyc
    pos = usyc.position(w3, owner_addr)
    usyc.price_guard(pos)
    shares = pos["shares"] if body.all else body.shares
    if shares <= 0 or shares > pos["shares"]:
        raise HTTPException(400, f"You hold {pos['shares'] / 1e6:.6f} USYC.")
    usdc = w3.eth.contract(address=Web3.to_checksum_address(signer.USDC), abi=signer.ERC20_MIN)
    bal_before = usdc.functions.balanceOf(Web3.to_checksum_address(owner_addr)).call()
    r = usyc.redeem(wallet_id or os.environ["OWNER_WALLET_ID"], owner_addr, shares)
    if str(r.get("state", "")).split(".")[-1] not in ("COMPLETE", "CONFIRMED"):
        raise HTTPException(502, f"USYC redeem did not complete: {r.get('errorReason') or r.get('state')}")
    got = usdc.functions.balanceOf(Web3.to_checksum_address(owner_addr)).call() - bal_before
    if (p.get("workspace_id") or 1) == 1:
        _usyc_event("USYC_REDEEM", max(got, 0), shares, r.get("txHash"))
    return {"txHash": r.get("txHash"), "usdc_received": got, "usyc": usyc.position(w3, owner_addr)}


class TreasuryFundIn(BaseModel):
    owner_secret: str = ""   # machine callers only; the dashboard uses the session cookie
    amount: int


@app.post("/treasury/fund")
def fund_treasury(body: TreasuryFundIn, request: Request):
    """Owner tops up the YieldSweeper reserve with USDC (plain ERC-20 transfer)."""
    p = auth.need(request, body.owner_secret)
    if (p.get("workspace_id") or 1) != 1:
        raise HTTPException(403, "The agent reserve belongs to the launch workspace.")
    return signer.owner_transfer_usdc(os.environ["YIELD_SWEEPER"], body.amount)


@app.post("/integrators", dependencies=[Depends(agent_auth)])
def add_integrator(name: str, repo: str):
    with db.conn() as c:
        c.execute("INSERT OR REPLACE INTO integrators VALUES(?,?,?)", (name, repo, int(time.time())))
    return {"ok": True}


# ======================================================================================================================
# Contractors + invite links (the product surface). A "contractor" = a person + their on-chain allowance + a private link.
# Owner adds a contractor (name, contact, optional wallet). No wallet → a Circle Developer-Controlled wallet is created for
# them (as circlefin/arc-escrow does at sign-up) and becomes the payee. The contractor uses the link to request payments;
# the API signs the EIP-712 milestone with their Circle wallet, or records link possession when they brought their own
# address. The agent and the contract see exactly the same milestone either way.
# ======================================================================================================================
PUBLIC_WEB = os.getenv("PUBLIC_WEB", "http://localhost:3000").rstrip("/")
PAYER_NAME = os.getenv("PAYER_NAME", "Acme Studio")


def _owner_header_auth(request: Request):
    auth.need(request)


def _sign_with_circle(wallet_id: str, allowance_id: int, title: str, amount: int, ev: str, nonce: str, payout_chain: str) -> str:
    from circle.web3 import developer_controlled_wallets as dcw
    from circle.web3 import utils
    client = utils.init_developer_controlled_wallets_client(api_key=os.environ["CIRCLE_API_KEY"], entity_secret=os.environ["CIRCLE_ENTITY_SECRET"])
    typed = {"types": {"EIP712Domain": [{"name": "name", "type": "string"}, {"name": "version", "type": "string"},
                                        {"name": "chainId", "type": "uint256"}, {"name": "verifyingContract", "type": "address"}], **TYPES},
             "primaryType": "Milestone", "domain": DOMAIN,
             "message": {"allowanceId": str(allowance_id), "title": title, "amount": str(amount), "evidenceHash": ev, "nonce": nonce, "payoutChain": payout_chain}}
    return dcw.SigningApi(client).sign_typed_data(dcw.SignTypedDataRequest.from_dict(
        {"walletId": wallet_id, "data": json.dumps(typed), "memo": "STEWARD milestone"})).data.signature


def _create_circle_wallet(name: str, kind: str = "contractor") -> tuple[str, str]:
    """Create a Circle Developer-Controlled EOA wallet on ARC-TESTNET in our wallet set. Returns (wallet_id, address)."""
    from circle.web3 import developer_controlled_wallets as dcw
    from circle.web3 import utils
    client = utils.init_developer_controlled_wallets_client(api_key=os.environ["CIRCLE_API_KEY"], entity_secret=os.environ["CIRCLE_ENTITY_SECRET"])
    res = dcw.WalletsApi(client).create_wallet(dcw.CreateWalletRequest.from_dict({
        "walletSetId": os.environ["CIRCLE_WALLET_SET_ID"], "blockchains": ["ARC-TESTNET"], "count": 1, "accountType": "EOA",
        "metadata": [{"name": f"{kind}:{name}"[:50]}]}))
    w = res.data.wallets[0]
    return w.id, w.address


def _payer_name(row: dict) -> str:
    try:
        return auth.workspace(row.get("workspace_id") or 1)["name"]
    except Exception:
        return PAYER_NAME


def _contractor_view(row: dict) -> dict:
    a = _allowance(row["allowance_id"])
    period_end = a["periodStart"] + a["period"] if a["period"] else None
    with db.conn() as c:
        pending = c.execute("SELECT COUNT(*) FROM milestones WHERE allowance_id=? AND status IN ('pending','escalated','held')", (row["allowance_id"],)).fetchone()[0]
        paid = c.execute("SELECT COUNT(*) FROM milestones WHERE allowance_id=? AND status IN ('paid','partial')", (row["allowance_id"],)).fetchone()[0]
    return {"id": row["id"], "name": row["name"], "contact": row["contact"], "address": row["address"], "has_circle_wallet": bool(row["circle_wallet_id"]),
            "allowance_id": row["allowance_id"], "status": "revoked" if a["revoked"] else row["status"], "created_at": row["created_at"],
            "link": f"{PUBLIC_WEB}/c/{row['token']}", "payer": _payer_name(row), "payout_address": row.get("payout_address"),
            "policy": {"per_tx": a["perTxCap"], "cap_period": a["capPerPeriod"], "period": a["period"], "expiry": a["expiry"]},
            "budget": {"funded": a["funded"], "spent_this_period": a["spentThisPeriod"], "remaining_this_period": max(a["capPerPeriod"] - a["spentThisPeriod"], 0),
                       "period_start": a["periodStart"], "period_end": period_end},
            "requests": {"open": pending, "paid": paid}}


class ContractorIn(BaseModel):
    owner_secret: str = ""   # machine callers only; the dashboard uses the session cookie
    name: str
    contact: str = ""
    address: str = ""            # blank → create a Circle wallet for them
    allowance_id: int | None = None   # attach an existing on-chain allowance instead of creating one
    per_tx: int = 200_000_000
    cap_period: int = 800_000_000
    period: int = 604_800
    expiry: int = 0
    fund: int = 0


@app.post("/contractors")
def add_contractor(body: ContractorIn, request: Request):
    p = auth.need(request, body.owner_secret)
    ws = auth.workspace(p.get("workspace_id"))
    wallet_id_owner, owner_addr = _wallet(p)
    import secrets as _secrets
    address, wallet_id = body.address.strip(), None
    out: dict = {}
    if body.allowance_id is not None:
        _check(p, body.allowance_id)
        a = _allowance(body.allowance_id)
        if a["payee"] == "0x0000000000000000000000000000000000000000":
            raise HTTPException(404, "no such allowance")
        address, aid = a["payee"], body.allowance_id
    else:
        if signer.OWNER_SIGNER == "circle":   # a new workspace's wallet starts empty: say so instead of failing on gas
            usdc_c = w3.eth.contract(address=Web3.to_checksum_address(signer.USDC), abi=signer.ERC20_MIN)
            have = usdc_c.functions.balanceOf(Web3.to_checksum_address(owner_addr)).call()
            need = body.fund + 50_000   # the budget plus a little for Arc fees (paid in USDC)
            if have < need:
                raise HTTPException(402, f"Your wallet has {have / 1e6:.2f} USDC; this needs about {need / 1e6:.2f}. "
                                         "Add test USDC from faucet.circle.com (Arc Testnet) to your wallet address on the Overview page.")
        if not address:
            if not os.environ.get("CIRCLE_WALLET_SET_ID"):
                raise HTTPException(400, "no wallet address given and Circle wallet creation is not configured")
            wallet_id, address = _create_circle_wallet(body.name)
            out["circle_wallet_created"] = True
        address = Web3.to_checksum_address(address)
        r = signer.owner_create(os.environ["AGENT_ADDRESS"], address, body.cap_period, body.per_tx, body.period, body.expiry, wallet_id_owner)
        aid = AM.functions.nextId().call() - 1
        out["create_tx"] = r["txHash"]
        if body.fund:
            out["fund_tx"] = signer.owner_fund(aid, body.fund, wallet_id_owner)["txHash"]
    cid, token = str(uuid.uuid4()), _secrets.token_urlsafe(24)
    with db.conn() as c:
        c.execute("INSERT INTO contractors(id,name,contact,address,circle_wallet_id,allowance_id,token,status,created_at,workspace_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
                  (cid, body.name.strip(), body.contact.strip(), address, wallet_id, aid, token, "active", int(time.time()), ws["id"]))
        c.execute("INSERT OR IGNORE INTO payers VALUES(?,?,?)", (owner_addr, ws["name"], int(time.time())))
        row = dict(c.execute("SELECT * FROM contractors WHERE id=?", (cid,)).fetchone())
    return {**out, **_contractor_view(row)}


@app.get("/contractors")
def list_contractors(p: dict = Depends(viewer)):
    with db.conn() as c:
        if p.get("workspace_id") is None:
            rows = [dict(r) for r in c.execute("SELECT * FROM contractors ORDER BY created_at DESC")]
        else:
            rows = [dict(r) for r in c.execute("SELECT * FROM contractors WHERE COALESCE(workspace_id,1)=? ORDER BY created_at DESC", (p["workspace_id"],))]
    return [_contractor_view(r) for r in rows]


class OwnerActionIn(BaseModel):
    owner_secret: str = ""   # machine callers only; the dashboard uses the session cookie
    amount: int = 0


@app.post("/contractors/{id}/fund")
def fund_contractor(id: str, body: OwnerActionIn, request: Request):
    p = auth.need(request, body.owner_secret)
    row = _own_contractor(p, id)
    return signer.owner_fund(row["allowance_id"], body.amount, _wallet(p)[0])


@app.post("/contractors/{id}/reset-payout")
def reset_payout(id: str, body: OwnerActionIn, request: Request):
    """The business clears a contractor's saved payout address (for example after they changed wallets)."""
    p = auth.need(request, body.owner_secret)
    row = _own_contractor(p, id)
    with db.conn() as c:
        c.execute("UPDATE contractors SET payout_address=NULL WHERE id=?", (row["id"],))
    return {"ok": True}


def _own_contractor(p: dict, id: str) -> dict:
    with db.conn() as c:
        row = c.execute("SELECT * FROM contractors WHERE id=?", (id,)).fetchone()
    if not row or (p.get("workspace_id") is not None and (row["workspace_id"] or 1) != p["workspace_id"]):
        raise HTTPException(404)
    return dict(row)


@app.post("/contractors/{id}/revoke")
def revoke_contractor(id: str, body: OwnerActionIn, request: Request):
    """Ends the allowance: unspent USDC returns to the owner and the agent is locked out. The link stops accepting requests."""
    p = auth.need(request, body.owner_secret)
    row = _own_contractor(p, id)
    r = signer.owner_revoke(row["allowance_id"], _wallet(p)[0])
    with db.conn() as c:
        c.execute("UPDATE contractors SET status='revoked' WHERE id=?", (id,))
    return r


def _by_token(token: str) -> dict:
    with db.conn() as c:
        row = c.execute("SELECT * FROM contractors WHERE token=?", (token,)).fetchone()
    if not row:
        raise HTTPException(404, "this link is not valid")
    return dict(row)


@app.get("/c/{token}")
def contractor_portal(token: str, request: Request, response: Response):
    row = _by_token(token)
    viewer_user = auth.session_user(request)
    if not viewer_user or viewer_user.get("role") == "demo":   # a signed-in owner checking a link is not a new person
        usage.track(request, response, "contractor_view")
    v = _contractor_view(row)
    with db.conn() as c:
        ms = [dict(r) for r in c.execute("SELECT * FROM milestones WHERE allowance_id=? ORDER BY created_at DESC LIMIT 100", (row["allowance_id"],))]
        for m in ms:
            d = c.execute("SELECT hash, action, rule, reason, amount, remainder, record_tx, pay_tx, escalate_tx, approved_tx, mint_tx, human_agreed, created_at FROM decisions WHERE milestone_id=? ORDER BY created_at DESC LIMIT 1", (m["id"],)).fetchone()
            m["decision"] = dict(d) if d else None
            m.pop("signature", None)
    v["requests_list"] = ms
    v["explorer"] = EXPLORER
    v["wallet"] = _contractor_wallet(row)
    return v


# ---- the contractor's own money: send it to their own wallet (locked payout address) or park it in USYC ----
FEE_RESERVE = 20_000   # 0.02 USDC stays behind for Arc's network fee (fees are paid in USDC from the same wallet)
DENY = {"0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "0x0000000000000000000000000000000000000000"}


def _usdc_of(addr: str) -> int:
    usdc = w3.eth.contract(address=Web3.to_checksum_address(signer.USDC), abi=signer.ERC20_MIN)
    return usdc.functions.balanceOf(Web3.to_checksum_address(addr)).call()


def _contractor_wallet(row: dict) -> dict | None:
    """Balance of the Circle wallet STEWARD created for the contractor, where it can go, and what already left."""
    if not row.get("circle_wallet_id"):
        return None
    try:
        bal = _usdc_of(row["address"])
    except Exception:
        return None
    with db.conn() as c:
        moves = [dict(r) for r in c.execute("SELECT kind, to_addr, amount, shares, tx, created_at FROM withdrawals WHERE contractor_id=? ORDER BY created_at DESC LIMIT 20", (row["id"],))]
    out = {"address": row["address"], "balance": bal, "available": max(bal - FEE_RESERVE, 0), "fee_reserve": FEE_RESERVE,
           "payout_address": row.get("payout_address"), "moves": moves}
    try:
        import usyc
        out["usyc"] = usyc.position(w3, row["address"])
    except Exception:
        pass
    return out


class WithdrawIn(BaseModel):
    to: str = ""
    confirm: str = ""
    amount: int = 0     # 0 = everything available


@app.post("/c/{token}/withdraw")
def contractor_withdraw(token: str, body: WithdrawIn):
    """Send USDC from the contractor's STEWARD wallet to their own wallet. The first send saves the address; after that the link
    can only send there, and only the business owner can reset it, so a leaked link cannot redirect the money."""
    row = _by_token(token)
    if not row.get("circle_wallet_id"):
        raise HTTPException(400, "Your payments already go straight to your own wallet.")
    saved, to = row.get("payout_address"), body.to.strip()
    if saved:
        if to and to.lower() != saved.lower():
            raise HTTPException(409, f"Your payout address is locked to {saved[:8]}…{saved[-4:]}. Ask {_payer_name(row)} to reset it if it changed.")
        to = saved
    else:
        if not Web3.is_address(to):
            raise HTTPException(400, "Enter a valid wallet address on Arc (0x followed by 40 characters).")
        if body.confirm.strip().lower() != to.lower():
            raise HTTPException(400, "The two addresses don't match. Check them and try again.")
        to = Web3.to_checksum_address(to)
        if to.lower() in DENY or to.lower() == row["address"].lower():
            raise HTTPException(400, "That address can't receive this payout.")
        with db.conn() as c:
            c.execute("UPDATE contractors SET payout_address=? WHERE id=?", (to, row["id"]))
    avail = max(_usdc_of(row["address"]) - FEE_RESERVE, 0)
    amount = body.amount or avail
    if amount <= 0 or amount > avail:
        raise HTTPException(400, f"You can send up to {avail / 1e6:.2f} USDC right now.")
    import circle_client as cc
    r = cc.wait(cc.execute(row["circle_wallet_id"], signer.USDC, "transfer(address,uint256)", [to, str(amount)]))
    if str(r.get("state", "")).split(".")[-1] not in ("COMPLETE", "CONFIRMED"):
        raise HTTPException(502, f"The transfer did not complete: {r.get('errorReason') or r.get('state')}")
    with db.conn() as c:
        c.execute("INSERT INTO withdrawals(contractor_id,kind,to_addr,amount,shares,tx,created_at) VALUES(?,?,?,?,?,?,?)",
                  (row["id"], "send", to, amount, 0, r.get("txHash"), int(time.time())))
    return {"txHash": r.get("txHash"), "amount": amount, "to": to}


class EarnIn(BaseModel):
    amount: int = 0     # USDC to move into USYC (0 = everything available)
    redeem_all: bool = False


@app.post("/c/{token}/earn")
def contractor_earn(token: str, body: EarnIn):
    """Park the contractor's idle USDC in USYC (or bring it back). Needs Circle to have allowlisted their wallet."""
    row = _by_token(token)
    if not row.get("circle_wallet_id"):
        raise HTTPException(400, "Yield is available for wallets STEWARD manages for you.")
    import usyc
    pos = usyc.position(w3, row["address"])
    usyc.price_guard(pos)
    if not pos["allowlisted"] and not body.redeem_all:
        raise HTTPException(403, "USYC is permissioned: Circle has to allowlist your wallet first.")
    try:
        if body.redeem_all:
            if not pos["shares"]:
                raise HTTPException(400, "You don't hold any USYC.")
            before = _usdc_of(row["address"])
            r = usyc.redeem(row["circle_wallet_id"], row["address"], pos["shares"])
            amount, shares, kind = max(_usdc_of(row["address"]) - before, 0), pos["shares"], "usyc_redeem"
        else:
            avail = max(_usdc_of(row["address"]) - FEE_RESERVE * 3, 0)   # approve + deposit need two fees
            amount = body.amount or avail
            if amount <= 0 or amount > avail:
                raise HTTPException(400, f"You can move up to {avail / 1e6:.2f} USDC into USYC right now.")
            r = usyc.deposit(row["circle_wallet_id"], row["address"], amount)
            shares, kind = max(usyc.position(w3, row["address"])["shares"] - pos["shares"], 0), "usyc_mint"
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"USYC did not go through ({str(e)[-60:]}). Nothing moved; try again later.")
    if str(r.get("state", "")).split(".")[-1] not in ("COMPLETE", "CONFIRMED"):
        raise HTTPException(502, f"USYC did not complete: {r.get('errorReason') or r.get('state')}")
    with db.conn() as c:
        c.execute("INSERT INTO withdrawals(contractor_id,kind,to_addr,amount,shares,tx,created_at) VALUES(?,?,?,?,?,?,?)",
                  (row["id"], kind, usyc.TELLER, amount, shares, r.get("txHash"), int(time.time())))
    return {"txHash": r.get("txHash"), "amount": amount, "shares": shares, "usyc": usyc.position(w3, row["address"])}


class RequestIn(BaseModel):
    title: str
    amount: int          # 6 dp
    evidence_url: str = ""
    payout_chain: str = "arc"


@app.post("/c/{token}/requests")
def contractor_request(token: str, body: RequestIn, request: Request, response: Response):
    row = _by_token(token)
    if row["status"] != "active":
        raise HTTPException(400, "this contractor link has been revoked")
    if body.payout_chain not in PAYOUT_CHAINS:
        raise HTTPException(400, f"payout_chain must be one of {PAYOUT_CHAINS}")
    if body.amount <= 0 or not body.title.strip():
        raise HTTPException(400, "title and a positive amount are required")
    a = _allowance(row["allowance_id"])
    if a["revoked"]:
        raise HTTPException(400, "this allowance has been revoked by the owner")
    nonce, ev = str(uuid.uuid4()), evidence_hash(body.evidence_url)
    if row["circle_wallet_id"]:
        sig, auth = _sign_with_circle(row["circle_wallet_id"], row["allowance_id"], body.title, body.amount, ev, nonce, body.payout_chain), "circle"
    else:
        sig, auth = "link:" + hashlib.sha256(f"{token}:{nonce}".encode()).hexdigest(), "link"
    mid = str(uuid.uuid4())
    with db.conn() as c:
        c.execute("INSERT INTO milestones(id,allowance_id,payee,title,amount,evidence_url,evidence_hash,signature,status,created_at,payout_chain,auth) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                  (mid, row["allowance_id"], a["payee"], body.title.strip(), body.amount, body.evidence_url.strip(), ev, sig, "pending", int(time.time()), body.payout_chain, auth))
    usage.track(request, response, "contractor_request")
    return {"id": mid, "status": "pending", "auth": auth, "evidence_hash": ev}


@app.get("/admin/db/export", dependencies=[Depends(_owner_header_auth)])
def admin_db_export():
    """Owner-only: download the SQLite file (used to move the deployment between hosts)."""
    from fastapi.responses import FileResponse
    return FileResponse(db.DB, media_type="application/octet-stream", filename="steward.db")


@app.post("/admin/db/import", dependencies=[Depends(_owner_header_auth)])
async def admin_db_import(request: Request):
    """Owner-only: replace the SQLite file with the uploaded bytes (raw body). Existing file is kept as .bak."""
    import shutil
    raw = await request.body()
    if not raw.startswith(b"SQLite format 3\x00"):
        raise HTTPException(400, "not a SQLite database")
    if os.path.exists(db.DB):
        shutil.copyfile(db.DB, db.DB + ".bak")
    with open(db.DB + ".tmp", "wb") as f:
        f.write(raw)
    os.replace(db.DB + ".tmp", db.DB)
    db.init()
    usage.init()
    with db.conn() as c:
        n = c.execute("SELECT COUNT(*) FROM contractors").fetchone()[0]
        m = c.execute("SELECT COUNT(*) FROM decisions").fetchone()[0]
    return {"ok": True, "contractors": n, "decisions": m, "bytes": len(raw)}


@app.post("/webhooks/circle")
async def circle_webhook(request: Request):
    """Circle wallet transaction notifications. Signature verification is ported from circlefin/arc-escrow
    (app/api/webhooks/circle/route.ts): fetch Circle's public key by X-Circle-Key-Id, verify the base64
    X-Circle-Signature over the body, reject otherwise. Verified notifications are stored for the dashboard."""
    raw = await request.body()
    sig, key_id = request.headers.get("x-circle-signature"), request.headers.get("x-circle-key-id")
    if not sig or not key_id:
        raise HTTPException(400, "missing X-Circle-Signature / X-Circle-Key-Id")
    if not circle_webhook_verify.verify(raw, sig, key_id):
        raise HTTPException(403, "invalid signature")
    payload = json.loads(raw or b"{}")
    n = payload.get("notification", {}) if isinstance(payload, dict) else {}
    with db.conn() as c:
        c.execute("CREATE TABLE IF NOT EXISTS webhooks(id INTEGER PRIMARY KEY AUTOINCREMENT, circle_tx_id TEXT, wallet_id TEXT, state TEXT, tx_hash TEXT, body TEXT, created_at INT)")
        c.execute("INSERT INTO webhooks(circle_tx_id, wallet_id, state, tx_hash, body, created_at) VALUES(?,?,?,?,?,?)",
                  (n.get("id"), n.get("walletId"), n.get("state"), n.get("txHash"), raw[:8000].decode(errors="ignore"), int(time.time())))
    return {"received": True}


@app.head("/webhooks/circle")
def circle_webhook_head():
    return {}
