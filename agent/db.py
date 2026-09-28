"""The API is the single source of truth. This module is a thin client over it (X-Agent-Key auth)."""
import time

import httpx

from config import API_BASE, API_SECRET

_H = {"X-Agent-Key": API_SECRET}
_pending: list[dict] = []
_signals: dict[str, dict] = {}


def cache_pending(items: list[dict]) -> None:
    global _pending
    _pending = items


def pending() -> list[dict]:
    return list(_pending)


def refresh_signals() -> None:
    """Fetch per-payee streak/late once per signals cycle."""
    global _signals
    with httpx.Client(timeout=20) as c:
        r = c.get(f"{API_BASE}/signals", headers=_H)
        r.raise_for_status()
        _signals = r.json()


def obligations_next_7d(allowance_id: int, exclude_milestone: str | None = None) -> int:
    """Sum of other pending milestones on this allowance — what we still owe if all are paid."""
    return sum(m["amount"] for m in _pending if m["allowance_id"] == allowance_id and m["id"] != exclude_milestone)


def streak(payee: str) -> int:
    return int(_signals.get(payee.lower(), {}).get("streak", 0))


def late(payee: str) -> int:
    return int(_signals.get(payee.lower(), {}).get("late", 0))


def save_decision(payload: dict) -> None:
    with httpx.Client(timeout=30) as c:
        r = c.post(f"{API_BASE}/decisions", json=payload, headers=_H)
        r.raise_for_status()


def mark_error(milestone_id: str, error: str) -> None:
    with httpx.Client(timeout=20) as c:
        c.post(f"{API_BASE}/milestones/{milestone_id}/error", json={"error": error[:500], "at": int(time.time())}, headers=_H)
