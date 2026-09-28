"""Human escalation channel. Day 2: log lines. Day 3: Telegram with an Approve button that calls approveAndPay()."""
import logging

log = logging.getLogger("steward.notify")


async def escalation(m: dict, d, dh_hex: str) -> None:
    log.warning("ESCALATION allowance=%s milestone=%s action=%s remainder=%.2f reason=%s hash=%s",
                m["allowance_id"], m["id"], d.action, d.remainder / 1e6, d.reason, dh_hex)


async def hold(m: dict, d) -> None:
    log.info("HOLD milestone=%s (%s): %s", m["id"], m["title"], d.reason)
