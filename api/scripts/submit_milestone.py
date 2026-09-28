"""Contractor CLI: sign an EIP-712 milestone with the payee key and submit it to the STEWARD API.

    python scripts/submit_milestone.py --allowance 0 --title "logo v2" --amount 150 --evidence https://... \
        --key 0x<payee private key> --api http://127.0.0.1:8001 --am 0x<AllowanceManager>

The web contractor page (Day 5) does the same with MetaMask; this is the no-browser path for the real freelancer.
"""
import argparse
import hashlib
import json
import uuid

import httpx
from eth_account import Account
from eth_account.messages import encode_typed_data

TYPES = {"Milestone": [{"name": "allowanceId", "type": "uint256"}, {"name": "title", "type": "string"},
                       {"name": "amount", "type": "uint128"}, {"name": "evidenceHash", "type": "bytes32"},
                       {"name": "nonce", "type": "string"}]}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--allowance", type=int, required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--amount", type=float, required=True, help="USDC, e.g. 150 or 12.50")
    p.add_argument("--evidence", default="")
    p.add_argument("--key", required=True, help="payee private key (hex)")
    p.add_argument("--api", default="http://127.0.0.1:8001")
    p.add_argument("--am", required=True, help="AllowanceManager address")
    p.add_argument("--chain-id", type=int, default=5042002)
    a = p.parse_args()

    amount = int(round(a.amount * 1e6))
    nonce = str(uuid.uuid4())
    ev = "0x" + hashlib.sha256(a.evidence.encode()).hexdigest()
    domain = {"name": "STEWARD", "version": "1", "chainId": a.chain_id, "verifyingContract": a.am}
    msg = encode_typed_data(domain_data=domain, message_types=TYPES, message_data={
        "allowanceId": a.allowance, "title": a.title, "amount": amount, "evidenceHash": ev, "nonce": nonce})
    acct = Account.from_key(a.key)
    sig = acct.sign_message(msg).signature.hex()
    sig = sig if sig.startswith("0x") else "0x" + sig
    body = {"allowance_id": a.allowance, "title": a.title, "amount": amount, "evidence_url": a.evidence, "nonce": nonce, "signature": sig}
    r = httpx.post(f"{a.api}/milestones", json=body, timeout=30)
    print(r.status_code, json.dumps(r.json(), indent=2))
    print(f"signed by {acct.address}")


if __name__ == "__main__":
    main()
