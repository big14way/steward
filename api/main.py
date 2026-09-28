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
from fastapi import Depends, FastAPI, Header, HTTPException, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from web3 import Web3  # noqa: E402

import circle_webhook_verify  # noqa: E402
import db  # noqa: E402
import signer  # noqa: E402

app = FastAPI(title="STEWARD API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
db.init()

w3 = signer.w3
CHAIN_ID = signer.CHAIN_ID
AM_ADDR = Web3.to_checksum_address(os.environ["ALLOWANCE_MANAGER"])
AM = w3.eth.contract(address=AM_ADDR, abi=signer.abi("AllowanceManager"))
KEYS = ["owner", "agent", "payee", "capPerPeriod", "perTxCap", "period", "periodStart", "expiry", "spentThisPeriod", "funded", "revoked"]
EXPLORER = os.getenv("EXPLORER", "https://explorer.testnet.arc.io")


def agent_auth(x_agent_key: str = Header(default="")):
    if not os.environ.get("API_SECRET") or x_agent_key != os.environ["API_SECRET"]:
        raise HTTPException(401)


def owner_auth(secret: str):
    if not os.environ.get("API_SECRET") or secret != os.environ["API_SECRET"]:
        raise HTTPException(401)


# ---- EIP-712 milestone typed data (contractor signs in browser or CLI; server verifies) ----
DOMAIN = {"name": "STEWARD", "version": "1", "chainId": CHAIN_ID, "verifyingContract": AM_ADDR}
TYPES = {"Milestone": [{"name": "allowanceId", "type": "uint256"}, {"name": "title", "type": "string"},
                       {"name": "amount", "type": "uint128"}, {"name": "evidenceHash", "type": "bytes32"},
                       {"name": "nonce", "type": "string"}]}


def evidence_hash(url: str) -> str:
    return "0x" + hashlib.sha256(url.encode()).hexdigest()


def _allowance(id: int) -> dict:
    return dict(zip(KEYS, AM.functions.allowances(id).call()))


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


@app.post("/milestones")
def submit_milestone(m: MilestoneIn):
    a = _allowance(m.allowance_id)
    payee = a["payee"]
    if payee == "0x0000000000000000000000000000000000000000":
        raise HTTPException(404, "no such allowance")
    ev = evidence_hash(m.evidence_url)
    msg = encode_typed_data(domain_data=DOMAIN, message_types=TYPES, message_data={
        "allowanceId": m.allowance_id, "title": m.title, "amount": m.amount, "evidenceHash": ev, "nonce": m.nonce})
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
        c.execute("INSERT INTO milestones(id,allowance_id,payee,title,amount,evidence_url,evidence_hash,signature,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                  (mid, m.allowance_id, payee, m.title, m.amount, m.evidence_url, ev, m.signature, "pending", int(time.time())))
    return {"id": mid, "status": "pending", "payee": payee, "evidence_hash": ev}


@app.get("/milestones")
def list_milestones(allowance_id: int | None = None, payee: str | None = None, status: str | None = None, limit: int = 200):
    q, args = "SELECT * FROM milestones WHERE 1=1", []
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
def list_decisions(allowance_id: int | None = None, action: str | None = None, limit: int = 100):
    q, args = "SELECT * FROM decisions WHERE 1=1", []
    if allowance_id is not None:
        q += " AND allowance_id=?"; args.append(allowance_id)
    if action:
        q += " AND action=?"; args.append(action)
    q += " ORDER BY created_at DESC LIMIT ?"; args.append(limit)
    with db.conn() as c:
        return [dict(r) for r in c.execute(q, args)]


@app.get("/decisions/{hash}")
def get_decision(hash: str):
    with db.conn() as c:
        d = c.execute("SELECT * FROM decisions WHERE hash=?", (hash,)).fetchone()
    if not d:
        raise HTTPException(404)
    out = dict(d)
    out["replay"] = {"canonical": out["canonical"], "keccak256": "0x" + Web3.keccak(text=out["canonical"]).hex().removeprefix("0x"),
                     "matches": ("0x" + Web3.keccak(text=out["canonical"]).hex().removeprefix("0x")).lower() == hash.lower()}
    return out


@app.get("/escalations")
def escalations():
    with db.conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM decisions WHERE action IN ('ESCALATE','PARTIAL','SCREEN_FAIL') AND approved_tx IS NULL AND human_agreed IS NULL ORDER BY created_at DESC")]


class ApproveIn(BaseModel):
    owner_secret: str   # shared secret for the judge/owner UI; ADAPT to session auth if time


@app.post("/escalations/{hash}/approve")
def approve(hash: str, body: ApproveIn):
    owner_auth(body.owner_secret)
    with db.conn() as c:
        d = c.execute("SELECT * FROM decisions WHERE hash=?", (hash,)).fetchone()
    if not d:
        raise HTTPException(404)
    if d["action"] == "SCREEN_FAIL":
        raise HTTPException(400, "screen failures cannot be approved")
    if d["approved_tx"]:
        raise HTTPException(409, "already approved")
    # PARTIAL remainders are keyed by their derived escalation hash (the decision hash was consumed by pay()).
    r = signer.owner_approve_and_pay(d["allowance_id"], d["remainder"], d["escalation_hash"] or hash)
    with db.conn() as c:
        c.execute("UPDATE decisions SET approved_tx=?, human_agreed=1 WHERE hash=?", (r["txHash"], hash))
        c.execute("UPDATE milestones SET status='paid', paid_tx=? WHERE id=?", (r["txHash"], d["milestone_id"]))
    return r


@app.post("/escalations/{hash}/reject")
def reject(hash: str, body: ApproveIn):
    owner_auth(body.owner_secret)
    with db.conn() as c:
        c.execute("UPDATE decisions SET human_agreed=0 WHERE hash=?", (hash,))
        c.execute("UPDATE milestones SET status='rejected' WHERE id=(SELECT milestone_id FROM decisions WHERE hash=?)", (hash,))
    return {"ok": True}


class AllowanceIn(BaseModel):
    owner_secret: str
    payee: str
    cap_period: int
    per_tx: int
    period: int
    expiry: int = 0
    fund: int = 0
    payer_name: str = ""


@app.post("/allowances")
def create_allowance(a: AllowanceIn):
    owner_auth(a.owner_secret)
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
    owner_secret: str
    amount: int   # 6 dp


@app.post("/allowances/{id}/fund")
def fund_allowance(id: int, body: FundIn):
    owner_auth(body.owner_secret)
    return signer.owner_fund(id, body.amount)


class RevokeIn(BaseModel):
    owner_secret: str


@app.post("/allowances/{id}/revoke")
def revoke_allowance(id: int, body: RevokeIn):
    owner_auth(body.owner_secret)
    return signer.owner_revoke(id)


@app.get("/allowances")
def list_allowances():
    n = AM.functions.nextId().call()
    return [{"id": i, **_allowance(i)} for i in range(n)]


@app.get("/allowances/{id}")
def get_allowance(id: int):
    return {"id": id, **_allowance(id)}


@app.get("/stats")
def stats():
    return db.stats()


@app.post("/integrators", dependencies=[Depends(agent_auth)])
def add_integrator(name: str, repo: str):
    with db.conn() as c:
        c.execute("INSERT OR REPLACE INTO integrators VALUES(?,?,?)", (name, repo, int(time.time())))
    return {"ok": True}


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
