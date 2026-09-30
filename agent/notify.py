"""Human escalation channel: one STEWARD bot, one chat per workspace.

A business connects Telegram from its dashboard: the one-time link opens the bot, Start sends `/start <code>`, and the API
stores that chat for the workspace. Every ESCALATE / PARTIAL / SCREEN_FAIL then goes only to the chat of the workspace that owns
the budget, with Approve / Reject buttons. A tap calls the API with the agent key plus `X-Telegram-Chat`, and the API only
lets a chat act on its own workspace's budgets; `approveAndPay()` is signed by that workspace's Circle wallet. SCREEN_FAIL gets
no Approve button. Without TELEGRAM_TOKEN everything degrades to log lines. python-telegram-bot 22.x (async).
"""
import asyncio
import logging

import httpx

from config import API_BASE, API_SECRET, TELEGRAM_CHAT, TELEGRAM_TOKEN

log = logging.getLogger("steward.notify")
_app = None
EXPLORER = "https://explorer.testnet.arc.io"


def enabled() -> bool:
    return bool(TELEGRAM_TOKEN)


_H = {"X-Agent-Key": API_SECRET}


async def _route(allowance_id: int | None) -> tuple[str | None, str]:
    """(chat id, workspace name) for the workspace that owns this budget; the launch workspace falls back to TELEGRAM_CHAT."""
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = (await c.get(f"{API_BASE}/telegram/route", params={} if allowance_id is None else {"allowance_id": allowance_id}, headers=_H)).json()
        chat = r.get("chat_id") or (TELEGRAM_CHAT if r.get("workspace_id") == 1 else None)
        return chat, r.get("workspace", "")
    except Exception as e:
        log.warning("telegram route failed: %s", e)
        return None, ""


def _fmt(m: dict, d, dh_hex: str, workspace: str) -> str:
    head = "⛔ <b>Blocked</b>" if d.action == "SCREEN_FAIL" else "🧾 <b>Approval needed</b>"
    return (f"{head} · {workspace}\n"
            f"<b>{m['title']}</b> · {m['amount']/1e6:.2f} USDC requested"
            + (f", {d.amount/1e6:.2f} already paid" if d.amount else "")
            + f"\n{d.reason}\n<a href=\"{EXPLORER}/address/{m['payee']}\">payee</a> · decision <code>{dh_hex[:10]}…</code>")


async def _act(hash_: str, kind: str, chat_id) -> dict:
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post(f"{API_BASE}/escalations/{hash_}/{kind}", json={}, headers={**_H, "X-Telegram-Chat": str(chat_id)})
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
    res = await _act(hash_, kind, q.message.chat_id)
    if res.get("status_code") == 200 and kind == "approve":
        txt = f"✅ Approved and paid · <a href=\"{EXPLORER}/tx/{res.get('txHash')}\">view on Arc Testnet</a>"
    elif res.get("status_code") == 200:
        txt = "🚫 Declined"
    else:
        txt = f"❌ Couldn't {kind}: {res.get('detail', res)}"
    await q.edit_message_text(q.message.text_html + "\n\n" + txt, parse_mode="HTML", disable_web_page_preview=True)


async def _on_start(update, context) -> None:
    """/start <code> from a workspace's one-time link: connect this chat to that workspace."""
    code = (context.args or [""])[0]
    if not code:
        await update.message.reply_text("Hi, I'm the STEWARD bot. Connect me from your STEWARD dashboard (Approvals → Get approvals on Telegram).")
        return
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{API_BASE}/telegram/link", json={"code": code, "chat_id": str(update.effective_chat.id)}, headers=_H)
    if r.status_code == 200:
        ws = r.json().get("workspace", "your workspace")
        await update.message.reply_text(f"✅ Connected to {ws}. Requests over your policy will arrive here with Approve and Decline buttons.")
    else:
        await update.message.reply_text("That link has expired. Open your STEWARD dashboard and connect Telegram again.")


async def start() -> None:
    """Start the Telegram bot (polling) inside the agent's event loop. No-op without a token."""
    global _app
    if not enabled():
        log.info("telegram disabled (no TELEGRAM_TOKEN); escalations go to the log")
        return
    from telegram.ext import Application, CallbackQueryHandler, CommandHandler
    _app = Application.builder().token(TELEGRAM_TOKEN).build()
    _app.add_handler(CommandHandler("start", _on_start))
    _app.add_handler(CallbackQueryHandler(_on_button))
    await _app.initialize()
    await _app.start()
    await _app.updater.start_polling(drop_pending_updates=True)
    log.info("telegram bot polling (per-workspace chats)")


async def escalation(m: dict, d, dh_hex: str) -> None:
    log.warning("ESCALATION allowance=%s milestone=%s action=%s remainder=%.2f reason=%s hash=%s",
                m["allowance_id"], m["id"], d.action, d.remainder / 1e6, d.reason, dh_hex)
    if not _app:
        return
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    buttons = [InlineKeyboardButton("Reject", callback_data=f"reject:{dh_hex}")]
    if d.action != "SCREEN_FAIL":
        buttons.insert(0, InlineKeyboardButton(f"Approve & pay {d.remainder/1e6:.2f}", callback_data=f"approve:{dh_hex}"))
    chat, ws = await _route(m["allowance_id"])
    if not chat:
        return
    try:
        await _app.bot.send_message(chat_id=chat, text=_fmt(m, d, dh_hex, ws), parse_mode="HTML",
                                    reply_markup=InlineKeyboardMarkup([buttons]), disable_web_page_preview=True)
    except Exception as e:
        log.warning("telegram send failed: %s", e)


async def hold(m: dict, d) -> None:
    log.info("HOLD milestone=%s (%s): %s", m["id"], m["title"], d.reason)
    chat, ws = await _route(m["allowance_id"]) if _app else (None, "")
    if chat:
        try:
            await _app.bot.send_message(chat_id=chat, parse_mode="HTML",
                                        text=f"⏸ <b>On hold</b> · {ws}\n<b>{m['title']}</b>: {d.reason}")
        except Exception as e:
            log.warning("telegram send failed: %s", e)


async def info(text: str) -> None:
    log.info(text)
    chat, _ = await _route(None) if _app else (None, "")
    if chat:
        try:
            await _app.bot.send_message(chat_id=chat, text=text)
        except Exception as e:
            log.warning("telegram send failed: %s", e)


if __name__ == "__main__":   # smoke: python notify.py → sends a test message if configured
    async def _t():
        await start()
        await info("STEWARD agent notify test")
    asyncio.run(_t())
