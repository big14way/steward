"""Agent configuration. Every value is read once at import; secrets come from agent/.env (gitignored)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

RPC = os.getenv("ARC_RPC", "https://rpc.testnet.arc.io")
CHAIN_ID = int(os.getenv("CHAIN_ID", "5042002"))
USDC = "0x3600000000000000000000000000000000000000"
ALLOWANCE_MANAGER = os.environ["ALLOWANCE_MANAGER"]
AUDIT_LOG = os.environ["AUDIT_LOG"]
YIELD_SWEEPER = os.getenv("YIELD_SWEEPER")

# ADAPT (Day 2): SIGNER=local signs with AGENT_PRIVATE_KEY on this box; SIGNER=circle routes every write through a
# Circle Developer-Controlled Wallet (api/circle_client.py) so no agent key exists locally. Reads always use web3.
SIGNER = os.getenv("SIGNER", "local")
AGENT_PK = os.getenv("AGENT_PRIVATE_KEY")
if SIGNER == "local" and not AGENT_PK:
    raise RuntimeError("SIGNER=local needs AGENT_PRIVATE_KEY")

API_BASE = os.getenv("API_BASE", "http://127.0.0.1:8001")
API_SECRET = os.getenv("API_SECRET", "")
MIN_FEE_GWEI = 20                                    # Arc floor — never lower
RESERVE_FLOOR = int(os.getenv("RESERVE_FLOOR", "100000000"))   # 100 USDC, 6 dp
DENYLIST = {a.strip().lower() for a in os.getenv("DENYLIST", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8").split(",") if a.strip()}
LLM = os.getenv("LLM", "none")                       # groq | anthropic | none  (Day 3 turns this on)
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
TELEGRAM_CHAT = os.getenv("TELEGRAM_CHAT")
ABI_DIR = Path(os.getenv("ABI_DIR", Path(__file__).resolve().parent.parent / "contracts" / "abi"))
DECIDE_EVERY = int(os.getenv("DECIDE_EVERY", "300"))
SIGNALS_EVERY = int(os.getenv("SIGNALS_EVERY", "60"))
TREASURY_EVERY = int(os.getenv("TREASURY_EVERY", str(6 * 3600)))
SWEEP_MIN = int(os.getenv("SWEEP_MIN", "50000000"))      # don't bother sweeping less than 50 USDC
