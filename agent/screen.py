"""Payee screening. Local denylist now; Circle sanctions screening happens at wallet level and is logged by the API."""
from config import DENYLIST


def screen(addr: str) -> str:
    return "denylist" if addr.lower() in DENYLIST else "clear"

# ADAPT (stretch): also call a screening API paid via x402 Nanopayments; Circle wallets additionally sanctions-screen at submission — log both results.
