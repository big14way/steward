"""Human escalation channel.

With TELEGRAM_TOKEN + TELEGRAM_CHAT set, every ESCALATE / PARTIAL / SCREEN_FAIL posts to the owner's chat with inline
Approve / Reject buttons; a tap calls the API (`POST /escalations/{hash}/approve|reject`), which executes
`approveAndPay()` from the owner's Circle wallet. SCREEN_FAIL gets no Approve button (the API refuses it anyway, and the
chain would revert on a blocklisted payee). Without a token everything degrades to log lines so the agent still runs.
python-telegram-bot 22.x (async).
"""
import asyncio
import logging

import httpx

from config import API_BASE, API_SECRET, TELEGRAM_CHAT, TELEGRAM_TOKEN

log = logging.getLogger("steward.notify")
_app = None
EXPLORER = "https://explorer.testnet.arc.io"


def enabled() -> bool:
    return bool(TELEGRAM_TOKEN and TELEGRAM_CHAT)


def _fmt(m: dict, d, dh_hex: str) -> str:
    return (f"⚠️ <b>{d.action}</b> · allowance #{m['allowance_id']}\n"
            f"<b>{m['title']}</b> — requested {m['amount']/1e6:.2f} USDC"
            + (f", paid {d.amount/1e6:.2f} now" if d.amount else "")
            + f"\nremainder <b>{d.remainder/1e6:.2f} USDC</b> · rule <code>{d.rule}</code>\n"
            f"{d.reason}\n<code>{dh_hex}</code>")


async def _act(hash_: str, kind: str) -> dict:
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post(f"{API_BASE}/escalations/{hash_}/{kind}", json={"owner_secret": API_SECRET})
        try:
            body = r.json()
        except Exception:
            body = {"detail": r.text[:200]}
        body["status_code"] = r.status_code
        return body


async def _on_button(update, context) -> None:
    q = update.callback_query
    await q.answer()
    kind, hash_ = q.data.split(":", 1)
    res = await _act(hash_, kind)
    if res.get("status_code") == 200 and kind == "approve":
        txt = f"✅ approved · <a href=\"{EXPLORER}/tx/{res.get('txHash')}\">{str(res.get('txHash'))[:14]}…</a>"
    elif res.get("status_code") == 200:
        txt = "🚫 rejected"
    else:
        txt = f"❌ {kind} failed: {res.get('detail', res)}"
    await q.edit_message_text(q.message.text_html + "\n\n" + txt, parse_mode="HTML", disable_web_page_preview=True)


async def start() -> None:
    """Start the Telegram bot (polling) inside the agent's event loop. No-op without a token."""
    global _app
    if not enabled():
        log.info("telegram disabled (no TELEGRAM_TOKEN/TELEGRAM_CHAT); escalations go to the log")
        return
    from telegram.ext import Application, CallbackQueryHandler
    _app = Application.builder().token(TELEGRAM_TOKEN).build()
    _app.add_handler(CallbackQueryHandler(_on_button))
    await _app.initialize()
    await _app.start()
    await _app.updater.start_polling(drop_pending_updates=True)
    log.info("telegram bot polling; owner chat %s", TELEGRAM_CHAT)


async def escalation(m: dict, d, dh_hex: str) -> None:
    log.warning("ESCALATION allowance=%s milestone=%s action=%s remainder=%.2f reason=%s hash=%s",
                m["allowance_id"], m["id"], d.action, d.remainder / 1e6, d.reason, dh_hex)
    if not _app:
        return
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    buttons = [InlineKeyboardButton("Reject", callback_data=f"reject:{dh_hex}")]
    if d.action != "SCREEN_FAIL":
        buttons.insert(0, InlineKeyboardButton(f"Approve & pay {d.remainder/1e6:.2f}", callback_data=f"approve:{dh_hex}"))
    try:
        await _app.bot.send_message(chat_id=TELEGRAM_CHAT, text=_fmt(m, d, dh_hex), parse_mode="HTML",
                                    reply_markup=InlineKeyboardMarkup([buttons]), disable_web_page_preview=True)
    except Exception as e:
        log.warning("telegram send failed: %s", e)


async def hold(m: dict, d) -> None:
    log.info("HOLD milestone=%s (%s): %s", m["id"], m["title"], d.reason)
    if _app:
        try:
            await _app.bot.send_message(chat_id=TELEGRAM_CHAT, parse_mode="HTML",
                                        text=f"⏸ <b>HOLD</b> · allowance #{m['allowance_id']} · {m['title']} — {d.reason}")
        except Exception as e:
            log.warning("telegram send failed: %s", e)


async def info(text: str) -> None:
    log.info(text)
    if _app:
        try:
            await _app.bot.send_message(chat_id=TELEGRAM_CHAT, text=text)
        except Exception as e:
            log.warning("telegram send failed: %s", e)


if __name__ == "__main__":   # smoke: python notify.py → sends a test message if configured
    async def _t():
        await start()
        await info("STEWARD agent notify test")
    asyncio.run(_t())
