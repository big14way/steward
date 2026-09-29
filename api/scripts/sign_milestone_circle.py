"""Judge-demo helper: sign and submit a milestone with a Circle Developer-Controlled wallet (the "contractor" wallet), so a
demo payee needs no browser wallet at all. Circle's SigningApi.sign_typed_data produces the EIP-712 signature server-side;
the API recovers it against the allowance's on-chain payee exactly as it does for a MetaMask signature.

    cd api && .venv/bin/python scripts/sign_milestone_circle.py --allowance 0 --title "logo v2" --amount 1.5 --evidence https://…
    (uses CONTRACTOR_WALLET_ID from api/.env; --wallet-id to override)
"""
import argparse
import hashlib
import json
import os
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

TYPES = {
    "EIP712Domain": [{"name": "name", "type": "string"}, {"name": "version", "type": "string"},
                     {"name": "chainId", "type": "uint256"}, {"name": "verifyingContract", "type": "address"}],
    "Milestone": [{"name": "allowanceId", "type": "uint256"}, {"name": "title", "type": "string"}, {"name": "amount", "type": "uint128"},
                  {"name": "evidenceHash", "type": "bytes32"}, {"name": "nonce", "type": "string"}, {"name": "payoutChain", "type": "string"}],
}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--allowance", type=int, required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--amount", type=float, required=True, help="USDC")
    p.add_argument("--evidence", default="")
    p.add_argument("--payout", choices=["arc", "base-sepolia"], default="arc")
    p.add_argument("--wallet-id", default=os.environ.get("CONTRACTOR_WALLET_ID"))
    p.add_argument("--api", default=os.environ.get("API_BASE", "http://127.0.0.1:8001"))
    p.add_argument("--chain-id", type=int, default=int(os.environ.get("CHAIN_ID", "5042002")))
    a = p.parse_args()

    from circle.web3 import developer_controlled_wallets as dcw
    from circle.web3 import utils
    client = utils.init_developer_controlled_wallets_client(api_key=os.environ["CIRCLE_API_KEY"], entity_secret=os.environ["CIRCLE_ENTITY_SECRET"])

    amount = int(round(a.amount * 1e6))
    nonce = str(uuid.uuid4())
    ev = "0x" + hashlib.sha256(a.evidence.encode()).hexdigest()
    typed = {"types": TYPES, "primaryType": "Milestone",
             "domain": {"name": "STEWARD", "version": "1", "chainId": a.chain_id, "verifyingContract": os.environ["ALLOWANCE_MANAGER"]},
             "message": {"allowanceId": str(a.allowance), "title": a.title, "amount": str(amount), "evidenceHash": ev, "nonce": nonce, "payoutChain": a.payout}}
    sig = dcw.SigningApi(client).sign_typed_data(dcw.SignTypedDataRequest.from_dict(
        {"walletId": a.wallet_id, "data": json.dumps(typed), "memo": "STEWARD milestone"})).data.signature
    body = {"allowance_id": a.allowance, "title": a.title, "amount": amount, "evidence_url": a.evidence, "nonce": nonce, "signature": sig, "payout_chain": a.payout}
    r = httpx.post(f"{a.api}/milestones", json=body, timeout=60)
    print(r.status_code, json.dumps(r.json(), indent=2))


if __name__ == "__main__":
    main()
