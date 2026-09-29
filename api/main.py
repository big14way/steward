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


def approver_auth(secret: str):
    """Owner secret, or the scoped judge secret (approve / reject only — cannot create, fund, or revoke)."""
    js = os.environ.get("JUDGE_SECRET")
    if js and secret == js:
        return
    owner_auth(secret)


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
def account():
    """Owner account card: USDC balances of the owner wallet, the agent wallet (gas), and what is locked in budgets + reserve."""
    usdc = w3.eth.contract(address=Web3.to_checksum_address(signer.USDC), abi=signer.ERC20_MIN)
    owner = signer.owner_address()
    agent = os.environ.get("AGENT_ADDRESS")
    n = AM.functions.nextId().call()
    funded = sum(_allowance(i)["funded"] for i in range(n))
    reserve = None
    if os.environ.get("YIELD_SWEEPER"):
        try:
            reserve = usdc.functions.balanceOf(Web3.to_checksum_address(os.environ["YIELD_SWEEPER"])).call()
        except Exception:
            reserve = None
    return {"owner": owner, "owner_usdc": usdc.functions.balanceOf(Web3.to_checksum_address(owner)).call(),
            "agent": agent, "agent_usdc": usdc.functions.balanceOf(Web3.to_checksum_address(agent)).call() if agent else None,
            "in_budgets": funded, "in_reserve": reserve, "budgets": n, "payer": PAYER_NAME, "faucet": "https://faucet.circle.com", "explorer": EXPLORER}


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
    approver_auth(body.owner_secret)
    with db.conn() as c:
        d = c.execute("SELECT * FROM decisions WHERE hash=?", (hash,)).fetchone()
    if not d:
        raise HTTPException(404)
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
        r = cctp.payout_crosschain(d["remainder"], m["payee"], os.environ["OWNER_WALLET_ID"])
        with db.conn() as c:
            c.execute("UPDATE decisions SET approved_tx=?, mint_tx=?, human_agreed=1 WHERE hash=?", (r["burn_tx"], r["mint_tx"], hash))
            c.execute("UPDATE milestones SET status='paid', paid_tx=? WHERE id=?", (r["mint_tx"], d["milestone_id"]))
        return {"state": "COMPLETE", "txHash": r["burn_tx"], "mint_tx": r["mint_tx"], "chain": "base-sepolia"}
    # PARTIAL remainders are keyed by their derived escalation hash (the decision hash was consumed by pay()).
    r = signer.owner_approve_and_pay(d["allowance_id"], d["remainder"], d["escalation_hash"] or hash)
    with db.conn() as c:
        c.execute("UPDATE decisions SET approved_tx=?, human_agreed=1 WHERE hash=?", (r["txHash"], hash))
        c.execute("UPDATE milestones SET status='paid', paid_tx=? WHERE id=?", (r["txHash"], d["milestone_id"]))
    return r


@app.post("/escalations/{hash}/reject")
def reject(hash: str, body: ApproveIn):
    approver_auth(body.owner_secret)
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
def list_treasury(limit: int = 100):
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
    return out


class TreasuryFundIn(BaseModel):
    owner_secret: str
    amount: int


@app.post("/treasury/fund")
def fund_treasury(body: TreasuryFundIn):
    """Owner tops up the YieldSweeper reserve with USDC (plain ERC-20 transfer)."""
    owner_auth(body.owner_secret)
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


def _owner_header_auth(x_owner_secret: str = Header(default="")):
    owner_auth(x_owner_secret)


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


def _create_circle_wallet(name: str) -> tuple[str, str]:
    """Create a Circle Developer-Controlled EOA wallet on ARC-TESTNET in our wallet set. Returns (wallet_id, address)."""
    from circle.web3 import developer_controlled_wallets as dcw
    from circle.web3 import utils
    client = utils.init_developer_controlled_wallets_client(api_key=os.environ["CIRCLE_API_KEY"], entity_secret=os.environ["CIRCLE_ENTITY_SECRET"])
    res = dcw.WalletsApi(client).create_wallet(dcw.CreateWalletRequest.from_dict({
        "walletSetId": os.environ["CIRCLE_WALLET_SET_ID"], "blockchains": ["ARC-TESTNET"], "count": 1, "accountType": "EOA",
        "metadata": [{"name": f"contractor:{name}"[:50]}]}))
    w = res.data.wallets[0]
    return w.id, w.address


def _contractor_view(row: dict) -> dict:
    a = _allowance(row["allowance_id"])
    period_end = a["periodStart"] + a["period"] if a["period"] else None
    with db.conn() as c:
        pending = c.execute("SELECT COUNT(*) FROM milestones WHERE allowance_id=? AND status IN ('pending','escalated','held')", (row["allowance_id"],)).fetchone()[0]
        paid = c.execute("SELECT COUNT(*) FROM milestones WHERE allowance_id=? AND status IN ('paid','partial')", (row["allowance_id"],)).fetchone()[0]
    return {"id": row["id"], "name": row["name"], "contact": row["contact"], "address": row["address"], "has_circle_wallet": bool(row["circle_wallet_id"]),
            "allowance_id": row["allowance_id"], "status": "revoked" if a["revoked"] else row["status"], "created_at": row["created_at"],
            "link": f"{PUBLIC_WEB}/c/{row['token']}", "payer": PAYER_NAME,
            "policy": {"per_tx": a["perTxCap"], "cap_period": a["capPerPeriod"], "period": a["period"], "expiry": a["expiry"]},
            "budget": {"funded": a["funded"], "spent_this_period": a["spentThisPeriod"], "remaining_this_period": max(a["capPerPeriod"] - a["spentThisPeriod"], 0),
                       "period_start": a["periodStart"], "period_end": period_end},
            "requests": {"open": pending, "paid": paid}}


class ContractorIn(BaseModel):
    owner_secret: str
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
def add_contractor(body: ContractorIn):
    owner_auth(body.owner_secret)
    import secrets as _secrets
    address, wallet_id = body.address.strip(), None
    out: dict = {}
    if body.allowance_id is not None:
        a = _allowance(body.allowance_id)
        if a["payee"] == "0x0000000000000000000000000000000000000000":
            raise HTTPException(404, "no such allowance")
        address, aid = a["payee"], body.allowance_id
    else:
        if not address:
            if not os.environ.get("CIRCLE_WALLET_SET_ID"):
                raise HTTPException(400, "no wallet address given and Circle wallet creation is not configured")
            wallet_id, address = _create_circle_wallet(body.name)
            out["circle_wallet_created"] = True
        address = Web3.to_checksum_address(address)
        r = signer.owner_create(os.environ["AGENT_ADDRESS"], address, body.cap_period, body.per_tx, body.period, body.expiry)
        aid = AM.functions.nextId().call() - 1
        out["create_tx"] = r["txHash"]
        if body.fund:
            out["fund_tx"] = signer.owner_fund(aid, body.fund)["txHash"]
    cid, token = str(uuid.uuid4()), _secrets.token_urlsafe(24)
    with db.conn() as c:
        c.execute("INSERT INTO contractors(id,name,contact,address,circle_wallet_id,allowance_id,token,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                  (cid, body.name.strip(), body.contact.strip(), address, wallet_id, aid, token, "active", int(time.time())))
        c.execute("INSERT OR IGNORE INTO payers VALUES(?,?,?)", (signer.owner_address(), PAYER_NAME, int(time.time())))
        row = dict(c.execute("SELECT * FROM contractors WHERE id=?", (cid,)).fetchone())
    return {**out, **_contractor_view(row)}


@app.get("/contractors", dependencies=[Depends(_owner_header_auth)])
def list_contractors():
    with db.conn() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM contractors ORDER BY created_at DESC")]
    return [_contractor_view(r) for r in rows]


class OwnerActionIn(BaseModel):
    owner_secret: str
    amount: int = 0


@app.post("/contractors/{id}/fund")
def fund_contractor(id: str, body: OwnerActionIn):
    owner_auth(body.owner_secret)
    with db.conn() as c:
        row = c.execute("SELECT * FROM contractors WHERE id=?", (id,)).fetchone()
    if not row:
        raise HTTPException(404)
    return signer.owner_fund(row["allowance_id"], body.amount)


@app.post("/contractors/{id}/revoke")
def revoke_contractor(id: str, body: OwnerActionIn):
    """Ends the allowance: unspent USDC returns to the owner and the agent is locked out. The link stops accepting requests."""
    owner_auth(body.owner_secret)
    with db.conn() as c:
        row = c.execute("SELECT * FROM contractors WHERE id=?", (id,)).fetchone()
    if not row:
        raise HTTPException(404)
    r = signer.owner_revoke(row["allowance_id"])
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
def contractor_portal(token: str):
    row = _by_token(token)
    v = _contractor_view(row)
    with db.conn() as c:
        ms = [dict(r) for r in c.execute("SELECT * FROM milestones WHERE allowance_id=? ORDER BY created_at DESC LIMIT 100", (row["allowance_id"],))]
        for m in ms:
            d = c.execute("SELECT hash, action, rule, reason, amount, remainder, record_tx, pay_tx, escalate_tx, approved_tx, mint_tx, human_agreed, created_at FROM decisions WHERE milestone_id=? ORDER BY created_at DESC LIMIT 1", (m["id"],)).fetchone()
            m["decision"] = dict(d) if d else None
            m.pop("signature", None)
    v["requests_list"] = ms
    v["explorer"] = EXPLORER
    return v


class RequestIn(BaseModel):
    title: str
    amount: int          # 6 dp
    evidence_url: str = ""
    payout_chain: str = "arc"


@app.post("/c/{token}/requests")
def contractor_request(token: str, body: RequestIn):
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
