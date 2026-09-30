"""Real USYC on Arc Testnet, through Circle's Teller (ERC-4626 style: deposit USDC -> USYC, redeem USYC -> USDC).

The owner's Circle wallet is allowlisted by Circle (Sep 30, 2026), so idle owner USDC can sit in USYC and come back when a
budget needs topping up. Addresses from docs.arc.network (contract-addresses): Teller 0x9fdF…105A, USYC 0xe918…b86C.
The deployed YieldSweeper still points at MockUSYC (its vault is immutable); this module is the real-USYC path.
"""
import circle_client as cc

TELLER = "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A"
USYC = "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C"
USDC = "0x3600000000000000000000000000000000000000"

TELLER_ABI = [
    {"name": "previewRedeem", "type": "function", "stateMutability": "view", "inputs": [{"name": "shares", "type": "uint256"}], "outputs": [{"type": "uint256"}]},
    {"name": "previewDeposit", "type": "function", "stateMutability": "view", "inputs": [{"name": "assets", "type": "uint256"}], "outputs": [{"type": "uint256"}]},
    {"name": "maxDeposit", "type": "function", "stateMutability": "view", "inputs": [{"name": "account", "type": "address"}], "outputs": [{"type": "uint256"}]},
]
BAL_ABI = [{"name": "balanceOf", "type": "function", "stateMutability": "view", "inputs": [{"type": "address"}], "outputs": [{"type": "uint256"}]}]


def position(w3, owner: str) -> dict:
    """USYC held by `owner`, its value in USDC right now, the price of 1 USYC, and whether the address may subscribe."""
    from web3 import Web3
    owner = Web3.to_checksum_address(owner)
    teller = w3.eth.contract(address=Web3.to_checksum_address(TELLER), abi=TELLER_ABI)
    shares = w3.eth.contract(address=Web3.to_checksum_address(USYC), abi=BAL_ABI).functions.balanceOf(owner).call()
    price = teller.functions.previewRedeem(1_000_000).call()
    return {"teller": TELLER, "token": USYC, "shares": shares, "value": teller.functions.previewRedeem(shares).call() if shares else 0,
            "price": price, "allowlisted": teller.functions.maxDeposit(owner).call() > 0}


def deposit(wallet_id: str, owner: str, amount: int) -> dict:
    """approve(Teller) + deposit(amount, owner) from the owner's Circle wallet. Returns the deposit transaction."""
    cc.wait(cc.execute(wallet_id, USDC, "approve(address,uint256)", [TELLER, str(amount)]))
    return cc.wait(cc.execute(wallet_id, TELLER, "deposit(uint256,address)", [str(amount), owner]))


def redeem(wallet_id: str, owner: str, shares: int) -> dict:
    """approve USYC to the Teller + redeem(shares, owner, owner). Returns the redeem transaction."""
    cc.wait(cc.execute(wallet_id, USYC, "approve(address,uint256)", [TELLER, str(shares)]))
    return cc.wait(cc.execute(wallet_id, TELLER, "redeem(uint256,address,address)", [str(shares), owner, owner]))
