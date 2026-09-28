"""Thin wrapper over Circle Developer-Controlled Wallets contract execution on ARC-TESTNET.

Verified shape (Sep 28, 2026): docs.arc.network ERC-8183 tutorial, Python tab —
CreateContractExecutionTransactionForDeveloperRequest.from_dict({walletId|walletAddress+blockchain, contractAddress,
abiFunctionSignature, abiParameters:[...strings...], feeLevel}). uint256/uint128/bytes32 params are passed as strings.
The client is created lazily so importing this module never requires credentials.
"""
import os
import time
import uuid

_client = None
_tx = None

USDC = "0x3600000000000000000000000000000000000000"


def _api():
    global _client, _tx
    if _tx is None:
        from circle.web3 import developer_controlled_wallets as dcw
        from circle.web3 import utils
        _client = utils.init_developer_controlled_wallets_client(
            api_key=os.environ["CIRCLE_API_KEY"], entity_secret=os.environ["CIRCLE_ENTITY_SECRET"])
        _tx = dcw.TransactionsApi(_client)
    return _tx


def execute(wallet_id: str, contract: str, signature: str, params: list, fee_level: str = "MEDIUM") -> str:
    """Submit a contract call; returns the Circle transaction id. Poll with wait()."""
    from circle.web3 import developer_controlled_wallets as dcw
    req = dcw.CreateContractExecutionTransactionForDeveloperRequest.from_dict({
        "idempotencyKey": str(uuid.uuid4()),
        "walletId": wallet_id,
        "contractAddress": contract,
        "abiFunctionSignature": signature,
        "abiParameters": params,
        "feeLevel": fee_level,   # Circle prices Arc's 20 gwei floor itself; ADAPT to gasLimit/maxFee overrides if a tx is ever dropped
    })
    return _api().create_developer_transaction_contract_execution(req).data.id


def wait(tx_id: str, timeout: int = 120) -> dict:
    """Poll until COMPLETE/FAILED. Returns {'state','txHash','id'}."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = _api().get_transaction(id=tx_id).data.transaction
        state = r.state
        if state in ("COMPLETE", "CONFIRMED") and getattr(r, "tx_hash", None):
            return {"state": state, "txHash": r.tx_hash, "id": tx_id}
        if state in ("FAILED", "DENIED", "CANCELLED"):
            raise RuntimeError(f"circle tx {tx_id} {state}: {getattr(r, 'error_reason', None)}")
        time.sleep(3)
    raise TimeoutError(tx_id)


# ---- STEWARD-specific helpers (all 6-dp amounts as int → str) ----
def _am() -> str:
    return os.environ["ALLOWANCE_MANAGER"]


def _owner() -> str:
    return os.environ["OWNER_WALLET_ID"]


def _agent() -> str:
    return os.environ["AGENT_WALLET_ID"]


def owner_approve_usdc(amount: int):
    return wait(execute(_owner(), USDC, "approve(address,uint256)", [_am(), str(amount)]))


def owner_create(agent_addr, payee, cap_period, per_tx, period, expiry):
    return wait(execute(_owner(), _am(), "create(address,address,uint128,uint128,uint64,uint64)",
                        [agent_addr, payee, str(cap_period), str(per_tx), str(period), str(expiry)]))


def owner_fund(allowance_id: int, amount: int):
    return wait(execute(_owner(), _am(), "fund(uint256,uint128)", [str(allowance_id), str(amount)]))


def owner_approve_and_pay(allowance_id: int, amount: int, decision_hash_hex: str):
    return wait(execute(_owner(), _am(), "approveAndPay(uint256,uint128,bytes32)", [str(allowance_id), str(amount), decision_hash_hex]))


def owner_revoke(allowance_id: int):
    return wait(execute(_owner(), _am(), "revoke(uint256)", [str(allowance_id)]))


def agent_pay(allowance_id: int, amount: int, decision_hash_hex: str, memo: str):
    return wait(execute(_agent(), _am(), "pay(uint256,uint128,bytes32,string)", [str(allowance_id), str(amount), decision_hash_hex, memo]))


def agent_escalate(allowance_id: int, amount: int, decision_hash_hex: str, reason: str):
    return wait(execute(_agent(), _am(), "escalate(uint256,uint128,bytes32,string)", [str(allowance_id), str(amount), decision_hash_hex, reason[:200]]))


def agent_record(allowance_id: int, decision_hash_hex: str, action_code: int, amount: int):
    return wait(execute(_agent(), os.environ["AUDIT_LOG"], "record(uint256,bytes32,uint8,uint128)", [str(allowance_id), decision_hash_hex, str(action_code), str(amount)]))
