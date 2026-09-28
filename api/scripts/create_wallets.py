"""Day 1: creates a wallet set + 4 EOA wallets on ARC-TESTNET. Prints ids/addresses; paste into api/.env.

Usage:
    cd api && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
    CIRCLE_API_KEY=... CIRCLE_ENTITY_SECRET=... python scripts/create_wallets.py

Then fund OWNER and AGENT addresses at https://faucet.circle.com (Arc Testnet, USDC). The agent needs USDC for gas.
Wallet-creation shape follows developers.circle.com/contracts/scp-deploy-smart-contract (Python tab) — verified Sep 28, 2026.
"""
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

try:
    from circle.web3 import developer_controlled_wallets as dcw
    from circle.web3 import utils
except ImportError:  # pragma: no cover
    sys.exit("pip install circle-developer-controlled-wallets python-dotenv")

NAMES = ["owner", "agent", "contractor", "judge"]


def main() -> None:
    api_key = os.environ["CIRCLE_API_KEY"]
    entity_secret = os.environ["CIRCLE_ENTITY_SECRET"]
    client = utils.init_developer_controlled_wallets_client(api_key=api_key, entity_secret=entity_secret)
    ws_api, w_api = dcw.WalletSetsApi(client), dcw.WalletsApi(client)

    ws_id = os.getenv("CIRCLE_WALLET_SET_ID")
    if not ws_id:
        ws = ws_api.create_wallet_set(dcw.CreateWalletSetRequest.from_dict({"name": "STEWARD"}))
        ws_id = ws.data.wallet_set.actual_instance.id
    print(f"CIRCLE_WALLET_SET_ID={ws_id}")

    res = w_api.create_wallet(dcw.CreateWalletRequest.from_dict({
        "walletSetId": ws_id,
        "blockchains": ["ARC-TESTNET"],
        "count": len(NAMES),
        "accountType": "EOA",
        "metadata": [{"name": n} for n in NAMES],
    }))
    for w in res.data.wallets:
        meta = getattr(w, "metadata", None) or []
        name = None
        if meta:
            m0 = meta[0]
            name = m0.get("name") if isinstance(m0, dict) else getattr(m0, "name", None)
        print(json.dumps({"name": name, "id": w.id, "address": w.address, "blockchain": w.blockchain}))
    print("# paste ids/addresses into api/.env as OWNER_WALLET_ID / OWNER_ADDRESS etc.")


if __name__ == "__main__":
    main()
