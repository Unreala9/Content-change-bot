import os
import sys
import asyncio
from collections import deque
from datetime import datetime
from typing import Optional, List

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import requests
from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError, PhoneCodeInvalidError

from config import API_ID, API_HASH, SESSION_NAME, load_settings, save_settings

# Fix Windows terminal UTF-8 encoding
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

# Initialize Telethon Client
client = TelegramClient(SESSION_NAME, API_ID, API_HASH)

# In-memory storage for auth state & intercepted message history (max 100)
phone_code_hash_store = {}
recent_messages = deque(maxlen=100)
stats_counter = {
    "received": 0,
    "forwarded": 0,
    "auto_posted": 0,
    "filtered": 0,
    "errors": 0
}


# --- Request Schemas ---
class SendMessageRequest(BaseModel):
    destination_chat_id: str | int
    message: str


class UpdateSettingsRequest(BaseModel):
    webhook_url: Optional[str] = None
    source_channel_id: Optional[str] = None
    destination_channel_id: Optional[str] = None
    auto_post_telegram: Optional[bool] = None
    text_prefix: Optional[str] = None
    text_suffix: Optional[str] = None
    find_text: Optional[str] = None
    replace_text: Optional[str] = None
    keyword_filter: Optional[str] = None
    filter_mode: Optional[str] = None
    enabled: Optional[bool] = None


class SendCodeRequest(BaseModel):
    phone_number: str


class VerifyCodeRequest(BaseModel):
    phone_number: str
    code: str
    password: Optional[str] = None


class TestTransformRequest(BaseModel):
    sample_text: str
    text_prefix: Optional[str] = ""
    text_suffix: Optional[str] = ""
    find_text: Optional[str] = ""
    replace_text: Optional[str] = ""
    keyword_filter: Optional[str] = ""
    filter_mode: Optional[str] = "all"


# --- Text Transformation Engine ---
def apply_text_transformation(text: str, settings: dict) -> tuple[str, bool, str]:
    if not text:
        text = ""

    filter_mode = settings.get("filter_mode", "all")
    keyword_filter = settings.get("keyword_filter", "").strip()

    # Keyword Filter logic
    if filter_mode == "contains" and keyword_filter:
        keywords = [k.strip().lower() for k in keyword_filter.split(",") if k.strip()]
        text_lower = text.lower()
        if not any(kw in text_lower for kw in keywords):
            return text, False, f"Keyword missing (filter: '{keyword_filter}')"

    transformed = text

    # Find & Replace
    find_text = settings.get("find_text", "")
    replace_text = settings.get("replace_text", "")
    if find_text:
        transformed = transformed.replace(find_text, replace_text)

    # Prefix & Suffix
    prefix = settings.get("text_prefix", "")
    suffix = settings.get("text_suffix", "")

    if prefix:
        transformed = f"{prefix}{transformed}"
    if suffix:
        transformed = f"{transformed}{suffix}"

    return transformed, True, "Passed"


# --- Telethon NewMessage Listener ---
@client.on(events.NewMessage)
async def incoming_message_handler(event):
    stats_counter["received"] += 1
    settings = load_settings()

    if not settings.get("enabled", True):
        return

    try:
        chat = await event.get_chat()
        chat_name = getattr(chat, "title", None) or getattr(chat, "first_name", "Unknown")
        raw_text = event.raw_text or ""

        # Source Channel Filtering Check
        source_filter = str(settings.get("source_channel_id", "all")).strip()
        if source_filter and source_filter != "all":
            event_chat_id_str = str(event.chat_id)
            if source_filter != event_chat_id_str and source_filter.lower() != str(chat_name).lower():
                # Message does not belong to the selected source channel
                return

        # Transform message
        transformed_text, should_forward, reason = apply_text_transformation(raw_text, settings)

        log_item = {
            "id": event.id,
            "chat_id": event.chat_id,
            "chat_name": chat_name,
            "raw_message": raw_text,
            "transformed_message": transformed_text,
            "date": event.date.strftime("%Y-%m-%d %H:%M:%S") if event.date else datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "sender_id": event.sender_id,
            "status": "pending",
            "reason": reason,
            "webhook_url": settings.get("webhook_url", ""),
            "destination_chat_id": settings.get("destination_channel_id", ""),
            "auto_posted": False
        }

        if not should_forward:
            stats_counter["filtered"] += 1
            log_item["status"] = "skipped"
            recent_messages.appendleft(log_item)
            print(f"⏩ [Filtered] Chat: {chat_name} | Reason: {reason}")
            return

        payload = {
            "chat_id": event.chat_id,
            "chat_name": chat_name,
            "message_id": event.id,
            "message": transformed_text,
            "raw_message": raw_text,
            "date": str(event.date),
            "sender_id": event.sender_id,
        }

        # 1. Send to n8n Webhook
        webhook_url = settings.get("webhook_url", "")
        if webhook_url:
            loop = asyncio.get_event_loop()
            def post_webhook():
                return requests.post(webhook_url, json=payload, timeout=10)
            response = await loop.run_in_executor(None, post_webhook)
            log_item["status"] = f"sent (n8n HTTP {response.status_code})"
            log_item["status_code"] = response.status_code
            stats_counter["forwarded"] += 1
            print(f"✅ Sent to n8n ({chat_name}) | Status: {response.status_code}")

        # 2. Auto-Post Transformed Message to Destination Telegram Channel (if enabled)
        dest_channel_id = str(settings.get("destination_channel_id", "")).strip()
        auto_post_enabled = settings.get("auto_post_telegram", False)

        if auto_post_enabled and dest_channel_id:
            try:
                target_dest = int(dest_channel_id) if (dest_channel_id.isdigit() or dest_channel_id.startswith("-")) else dest_channel_id
                dest_entity = await client.get_entity(target_dest)
                await client.send_message(entity=dest_entity, message=transformed_text)
                log_item["auto_posted"] = True
                log_item["auto_post_status"] = f"Posted to {dest_channel_id}"
                stats_counter["auto_posted"] += 1
                print(f"🚀 Auto-posted transformed message to Telegram: {dest_channel_id}")
            except Exception as post_err:
                print(f"❌ Error auto-posting to Telegram channel: {post_err}")
                log_item["auto_post_status"] = f"Failed: {post_err}"

    except Exception as e:
        stats_counter["errors"] += 1
        print(f"❌ Error in listener: {e}")
        log_item["status"] = f"error: {str(e)}"
        recent_messages.appendleft(log_item)
    else:
        recent_messages.appendleft(log_item)


# --- FastAPI Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🔌 Starting Telegram Client...")
    try:
        await client.start()
        print("✅ Telegram Client Connected!")
    except Exception as e:
        print(f"⚠️ Telegram client start notice: {e}")
    yield
    print("🔌 Disconnecting Telegram Client...")
    if client.is_connected():
        await client.disconnect()
    print("✅ Disconnected!")


# --- FastAPI App ---
app = FastAPI(title="Telegram Sync Side-by-Side Mirror Studio", lifespan=lifespan)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")


# --- REST API Endpoints ---

@app.get("/api/status")
async def get_status():
    connected = client.is_connected()
    is_user_authorized = False
    me_info = None

    if connected:
        try:
            is_user_authorized = await client.is_user_authorized()
            if is_user_authorized:
                me = await client.get_me()
                me_info = {
                    "id": me.id,
                    "first_name": me.first_name,
                    "last_name": me.last_name or "",
                    "username": me.username or "",
                    "phone": me.phone or "",
                }
        except Exception as e:
            print(f"Error reading auth status: {e}")

    settings = load_settings()

    return {
        "connected": connected,
        "authorized": is_user_authorized,
        "user": me_info,
        "stats": stats_counter,
        "settings": settings
    }


@app.post("/api/auth/send-code")
async def send_auth_code(data: SendCodeRequest):
    if not client.is_connected():
        await client.connect()
    try:
        res = await client.send_code_request(data.phone_number)
        phone_code_hash_store[data.phone_number] = res.phone_code_hash
        return {"success": True, "message": "Verification code sent to your Telegram app!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/verify-code")
async def verify_auth_code(data: VerifyCodeRequest):
    if not client.is_connected():
        await client.connect()
    phone_code_hash = phone_code_hash_store.get(data.phone_number)
    try:
        await client.sign_in(
            phone=data.phone_number,
            code=data.code,
            phone_code_hash=phone_code_hash
        )
        me = await client.get_me()
        return {"success": True, "user": {"first_name": me.first_name, "username": me.username}}
    except SessionPasswordNeededError:
        if not data.password:
            raise HTTPException(status_code=401, detail="2FA Password required")
        await client.sign_in(password=data.password)
        me = await client.get_me()
        return {"success": True, "user": {"first_name": me.first_name, "username": me.username}}
    except PhoneCodeInvalidError:
        raise HTTPException(status_code=400, detail="Invalid code entered")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/channels")
async def get_channels():
    if not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram client not connected")

    try:
        dialogs = []
        async for dialog in client.iter_dialogs(limit=100):
            entity_type = type(dialog.entity).__name__
            dialogs.append({
                "id": str(dialog.id),
                "name": dialog.name or "Unnamed",
                "type": entity_type,
                "unread_count": dialog.unread_count,
                "pinned": dialog.pinned,
                "is_channel": dialog.is_channel,
                "is_group": dialog.is_group,
                "is_user": dialog.is_user,
            })
        return {"success": True, "count": len(dialogs), "channels": dialogs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/channel-history")
async def get_channel_history(chat_id: str, limit: int = 30):
    if not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram client not connected")

    if not chat_id or chat_id == "all":
        return {"success": True, "chat_id": chat_id, "messages": []}

    try:
        target = int(chat_id) if (chat_id.isdigit() or chat_id.startswith("-")) else chat_id
        entity = await client.get_entity(target)
        messages = []
        async for msg in client.iter_messages(entity, limit=limit):
            if msg.text:
                sender_name = "Unknown"
                if msg.sender:
                    sender_name = getattr(msg.sender, "title", None) or getattr(msg.sender, "first_name", "User")
                messages.append({
                    "id": msg.id,
                    "sender_id": msg.sender_id,
                    "sender_name": sender_name,
                    "text": msg.text,
                    "date": msg.date.strftime("%Y-%m-%d %H:%M:%S") if msg.date else "",
                    "out": msg.out
                })
        return {"success": True, "chat_id": chat_id, "messages": messages}
    except Exception as e:
        print(f"Error reading history for {chat_id}: {e}")
        return {"success": False, "error": str(e), "messages": []}



@app.post("/api/send")
async def send_message(data: SendMessageRequest):
    if not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram client not connected")

    try:
        chat_id = int(data.destination_chat_id) if (isinstance(data.destination_chat_id, str) and (data.destination_chat_id.isdigit() or data.destination_chat_id.startswith("-"))) else data.destination_chat_id
        entity = await client.get_entity(chat_id)
        await client.send_message(entity=entity, message=data.message)
        return {"success": True, "destination": data.destination_chat_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config")
async def get_config():
    return load_settings()


@app.post("/api/config")
async def update_config(data: UpdateSettingsRequest):
    updates = data.dict(exclude_unset=True)
    saved = save_settings(updates)
    return {"success": True, "settings": saved}


@app.post("/api/test-transform")
async def test_transform(data: TestTransformRequest):
    settings = data.dict()
    transformed, should_forward, reason = apply_text_transformation(data.sample_text, settings)
    return {
        "original_text": data.sample_text,
        "transformed_text": transformed,
        "should_forward": should_forward,
        "reason": reason
    }


@app.get("/api/messages")
async def get_messages():
    return {
        "success": True,
        "messages": list(recent_messages),
        "stats": stats_counter
    }


if __name__ == "__main__":
    import uvicorn
    import webbrowser

    print("=" * 70)
    print(" 🚀 TELEGRAM SYNC & SIDE-BY-SIDE MIRROR STUDIO")
    print("=" * 70)
    print(" ✅ All modules integrated: Login + Channel Explorer + Listener + Modifier + Web App")
    print(" 🌐 Server URL: http://localhost:8000")
    print("=" * 70 + "\n")

    try:
        webbrowser.open("http://localhost:8000")
    except Exception:
        pass

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)