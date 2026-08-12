import os
import sys
import re
import asyncio
from typing import Optional, List, Dict, Any, Set
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

import hmac
import hashlib
import base64
import requests

from config import (
    API_ID,
    API_HASH,
    SESSION_NAME,
    PORT,
    IS_SUPABASE_CONFIGURED,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    SUPABASE_EDGE_FUNCTION_URL,
    load_settings,
    save_settings
)
from supabase_client import (
    get_current_user,
    sign_up_user,
    sign_in_user,
    get_user_settings_from_db,
    save_user_settings_to_db,
    get_user_profile_from_db,
    get_user_sync_logs_from_db,
    get_user_subscription_from_db,
    update_user_subscription_in_db
)
from telegram_manager import (
    telegram_manager,
    get_user_messages,
    get_user_stats,
    update_settings_cache
)
from telethon.errors import AuthKeyDuplicatedError, AuthKeyUnregisteredError, UserDeactivatedError, UnauthorizedError

# Fix Windows terminal UTF-8 encoding
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass


# Tracked background tasks to ensure clean shutdown without 'Task destroyed but pending' warnings
app_background_tasks: Set[asyncio.Task] = set()


def create_tracked_task(coro):
    task = asyncio.create_task(coro)
    app_background_tasks.add(task)
    task.add_done_callback(app_background_tasks.discard)
    return task


# --- Request Schemas ---
class UserAuthRequest(BaseModel):
    email: str
    password: str


class SendMessageRequest(BaseModel):
    chat_id: str | int
    text: str


class UpdateSettingsRequest(BaseModel):
    webhook_url: Optional[str] = None
    source_channel_id: Optional[str] = None
    destination_channel_id: Optional[str] = None
    auto_post_telegram: Optional[bool] = None
    auto_post_n8n: Optional[bool] = None
    text_prefix: Optional[str] = None
    text_suffix: Optional[str] = None
    find_text: Optional[str] = None
    replace_text: Optional[str] = None
    replacement_rules: Optional[List[Dict[str, Any]]] = None
    override_all_links: Optional[bool] = None
    custom_link_url: Optional[str] = None
    remove_all_links: Optional[bool] = None
    override_media_image: Optional[bool] = None
    custom_image_url: Optional[str] = None
    strip_media_images: Optional[bool] = None
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
    replacement_rules: Optional[List[Dict[str, Any]]] = []
    override_all_links: Optional[bool] = False
    custom_link_url: Optional[str] = ""
    remove_all_links: Optional[bool] = False
    keyword_filter: Optional[str] = ""
    filter_mode: Optional[str] = "all"


class CreateRazorpayOrderRequest(BaseModel):
    plan_id: str  # "plan_599" or "plan_799"


class VerifyRazorpayPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_id: str
    user_id: Optional[str] = None


def case_insensitive_replace(source_text: str, find_pattern: str, replacement_text: str) -> str:
    if not find_pattern:
        return source_text
    escaped_find = re.escape(find_pattern)
    return re.sub(escaped_find, lambda m: replacement_text, source_text, flags=re.IGNORECASE)


# --- Text Transformation & Filtering Engine ---
def apply_text_transformation(text: str, settings: dict) -> tuple[str, bool, str]:
    if not text:
        text = ""

    filter_mode = settings.get("filter_mode", "all")
    keyword_filter = settings.get("keyword_filter", "").strip()

    # Keyword Filter logic
    if filter_mode == "allow_only" and keyword_filter:
        keywords = [k.strip().lower() for k in keyword_filter.split(",") if k.strip()]
        if not any(k in text.lower() for k in keywords):
            return text, False, f"Message does not contain allowed keywords ({keyword_filter})"

    elif filter_mode == "block_if" and keyword_filter:
        keywords = [k.strip().lower() for k in keyword_filter.split(",") if k.strip()]
        if any(k in text.lower() for k in keywords):
            return text, False, f"Message contains blocked keyword from ({keyword_filter})"

    transformed = text

    # Multi-rule replacement (Case-Insensitive)
    replacement_rules = settings.get("replacement_rules")
    if replacement_rules and isinstance(replacement_rules, list):
        for rule in replacement_rules:
            if isinstance(rule, dict):
                f_str = rule.get("find", "")
                r_str = rule.get("replace", "")
                if f_str:
                    transformed = case_insensitive_replace(transformed, f_str, r_str)

    # Legacy / Quick Mode Bulk Find/Replace (comma-separated support, Case-Insensitive)
    find_str = settings.get("find_text", "").strip()
    replace_str = settings.get("replace_text", "").strip()

    if find_str:
        find_list = [f.strip() for f in find_str.split(",") if f.strip()]
        replace_list = [r.strip() for r in replace_str.split(",")]
        for idx, target in enumerate(find_list):
            rep = replace_list[idx] if idx < len(replace_list) else (replace_list[-1] if replace_list else "")
            transformed = case_insensitive_replace(transformed, target, rep)

    # Link modification
    url_pattern = r'https?://[^\s]+'
    if settings.get("remove_all_links", False):
        transformed = re.sub(url_pattern, '', transformed)
    elif settings.get("override_all_links", False):
        custom_url = settings.get("custom_link_url", "").strip()
        if custom_url:
            transformed = re.sub(url_pattern, custom_url, transformed)

    # Prefix & Suffix
    prefix = settings.get("text_prefix", "").strip()
    suffix = settings.get("text_suffix", "").strip()

    if prefix:
        transformed = f"{prefix}\n{transformed}"
    if suffix:
        transformed = f"{transformed}\n{suffix}"

    return transformed.strip(), True, "Passed all filters"


# --- Lifespan Context Manager ---
@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    await telegram_manager.start()
    create_tracked_task(telegram_manager.connection_watchdog())
    yield
    print("🔌 Graceful Shutdown: Disconnecting Telegram clients & cleaning tasks...")
    await telegram_manager.disconnect_all()
    for task in list(app_background_tasks):
        if not task.done():
            task.cancel()
    if app_background_tasks:
        await asyncio.gather(*app_background_tasks, return_exceptions=True)
    app_background_tasks.clear()
    print("✅ Application shutdown complete.")


# --- FastAPI App ---
app = FastAPI(title="Telegram Sync Hub VPS Backend API", lifespan=lifespan)

default_origins = [
    "https://telegram.adshatke.site",
    "http://telegram.adshatke.site",
    "https://tg.adshatke.site",
    "http://tg.adshatke.site",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

cors_origins_env = os.getenv("CORS_ORIGINS", "")
if cors_origins_env:
    env_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
    origins = list(set(default_origins + env_origins))
else:
    origins = default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_cors_and_requests(request: Request, call_next):
    origin = request.headers.get("origin", "N/A")
    method = request.method
    path = request.url.path

    if method == "OPTIONS":
        response = await call_next(request)
        return response

    response = await call_next(request)
    return response


@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Telegram Sync Hub VPS Backend API",
        "docs": "/docs"
    }


@app.get("/api/auth/debug")
async def auth_debug(current_user: dict = Depends(get_current_user)):
    return {
        "authenticated": True,
        "user_id": current_user.get("id"),
        "email": current_user.get("email"),
    }


# --- User Authentication Endpoints ---

@app.post("/api/user/signup")
async def user_signup(data: UserAuthRequest):
    return sign_up_user(data.email, data.password)


@app.post("/api/user/login")
async def user_login(data: UserAuthRequest):
    return sign_in_user(data.email, data.password)


@app.get("/api/user/me")
async def get_user_me(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    profile = get_user_profile_from_db(user_id) if IS_SUPABASE_CONFIGURED else {}
    return {
        "user": current_user,
        "profile": profile,
        "supabase_configured": IS_SUPABASE_CONFIGURED
    }


# --- Telegram Sync & Studio API Endpoints ---

@app.get("/api/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    """
    Returns application and Telegram connection status.
    Does NOT initiate or create a new Telegram connection. Reuses existing client if present.
    """
    user_id = current_user["id"]
    profile = get_user_profile_from_db(user_id) if IS_SUPABASE_CONFIGURED else {}

    # Inspect existing client only
    client = telegram_manager.get_existing_client(user_id)

    is_authorized = False
    tg_user = None

    if client and client.is_connected():
        try:
            if await client.is_user_authorized():
                is_authorized = True
                me = await client.get_me()
                tg_user = {
                    "id": me.id,
                    "first_name": me.first_name or profile.get("telegram_first_name") or "Telegram User",
                    "username": me.username or profile.get("telegram_username") or "",
                    "phone": me.phone or profile.get("telegram_phone") or ""
                }
        except (AuthKeyDuplicatedError, AuthKeyUnregisteredError, UserDeactivatedError, UnauthorizedError) as auth_err:
            print(f"🚨 Invalidating duplicate/expired session for user {user_id[:8]}: {auth_err}")
            await telegram_manager.invalidate_session(user_id, reason=str(auth_err))
            is_authorized = False
            tg_user = None
        except Exception as e:
            print(f"Notice inspecting Telegram status for user {user_id[:8]}: {e}")

    if not tg_user and is_authorized and (profile.get("telegram_phone") or profile.get("telegram_first_name")):
        tg_user = {
            "id": profile.get("telegram_user_id") or profile.get("telegram_phone") or user_id[:8],
            "first_name": profile.get("telegram_first_name") or "Telegram User",
            "username": profile.get("telegram_username") or "",
            "phone": profile.get("telegram_phone") or ""
        }

    settings = get_user_settings_from_db(user_id) if IS_SUPABASE_CONFIGURED else load_settings()
    stats = get_user_stats(user_id)
    subscription = get_user_subscription_from_db(user_id)

    session_expired = bool(profile.get("telegram_phone") and not is_authorized)

    return {
        "connected": is_authorized,
        "authorized": is_authorized,
        "requires_login": not is_authorized,
        "session_expired": session_expired,
        "user": tg_user,
        "account": current_user,
        "stats": stats,
        "settings": settings,
        "subscription": subscription,
        "razorpay_key_id": RAZORPAY_KEY_ID,
        "edge_function_url": SUPABASE_EDGE_FUNCTION_URL,
        "supabase_configured": IS_SUPABASE_CONFIGURED
    }


def check_user_has_paid_subscription(user_id: str):
    # Allow all registered users (Free Tier and Paid Tier) to connect Telegram cleanly
    return True


@app.post("/api/auth/send-code")
async def send_auth_code(data: SendCodeRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    check_user_has_paid_subscription(user_id)
    try:
        res = await telegram_manager.send_auth_code(user_id, data.phone_number)
        return res
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/verify-code")
async def verify_auth_code(data: VerifyCodeRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    check_user_has_paid_subscription(user_id)
    try:
        res = await telegram_manager.verify_auth_code(
            user_id=user_id,
            phone_number=data.phone_number,
            code=data.code,
            password=data.password
        )
        return res
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/logout")
async def logout_telegram(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    try:
        res = await telegram_manager.logout_user(user_id)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


user_channels_cache: Dict[str, List[dict]] = {}

@app.get("/api/channels")
async def get_channels(
    refresh: bool = False,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    try:
        channels = await telegram_manager.get_user_dialogs(user_id, force_refresh=refresh)
        return {"success": True, "channels": channels, "requires_login": False}
    except Exception as e:
        print(f"❌ Error fetching channels for user {user_id[:8]}: {e}")
        if isinstance(e, (AuthKeyDuplicatedError, AuthKeyUnregisteredError, UserDeactivatedError, UnauthorizedError)):
            await telegram_manager.invalidate_session(user_id, reason=str(e))
            return {"success": False, "channels": [], "requires_login": True, "detail": str(e)}
        return {"success": False, "channels": [], "detail": str(e)}


from telethon.tl.types import PeerUser, PeerChat, PeerChannel

async def resolve_telegram_entity(client, channel_id: str):
    if not client or not channel_id:
        return None

    ch_str = str(channel_id).strip()
    clean_id = ch_str.replace("-100", "").replace("-", "").strip()

    # 1. Try direct get_entity with candidate ID, Peer objects, & username representations
    candidates = []
    if ch_str.startswith("-100"):
        candidates.append(int(ch_str))
        if clean_id.isdigit():
            candidates.append(PeerChannel(int(clean_id)))
    elif ch_str.startswith("-"):
        candidates.append(int(ch_str))
        if clean_id.isdigit():
            candidates.append(PeerChat(int(clean_id)))
            candidates.append(PeerChannel(int(clean_id)))
            candidates.append(int(f"-100{clean_id}"))
    elif clean_id.isdigit():
        num_id = int(clean_id)
        candidates.append(PeerUser(num_id))
        candidates.append(PeerChat(num_id))
        candidates.append(PeerChannel(num_id))
        candidates.append(int(f"-100{clean_id}"))
        candidates.append(-num_id)
        candidates.append(num_id)
    else:
        if not ch_str.startswith("@") and " " not in ch_str:
            candidates.append(f"@{ch_str}")
        candidates.append(ch_str)

    for cand in candidates:
        try:
            entity = await client.get_entity(cand)
            if entity:
                return entity
        except Exception:
            pass

    # 2. Fallback: Search in user dialogs (by clean numeric ID, title, or username)
    try:
        dialogs = await client.get_dialogs(limit=300)
        # Search by clean numeric ID
        for d in dialogs:
            d_clean = str(d.id).replace("-100", "").replace("-", "").strip()
            if d_clean and clean_id and d_clean == clean_id:
                return d.entity

        # Search by chat title / display name (case insensitive)
        ch_lower = ch_str.lower()
        for d in dialogs:
            d_name = (d.name or getattr(d.entity, "title", None) or getattr(d.entity, "first_name", None) or "").lower()
            if d_name and (d_name == ch_lower or ch_lower in d_name or d_name in ch_lower):
                return d.entity

        # Search by username
        for d in dialogs:
            d_user = (getattr(d.entity, "username", None) or "").lower()
            if d_user and d_user == ch_lower.replace("@", ""):
                return d.entity
    except Exception as dialog_err:
        print(f"⚠️ Dialogs search fallback error for {channel_id}: {dialog_err}")

    raise ValueError(f"Could not resolve Telegram entity for channel: {channel_id}")


def is_same_channel(val1: Any, val2: Any) -> bool:
    if not val1 or not val2:
        return False
    s1 = str(val1).strip().lower()
    s2 = str(val2).strip().lower()
    if s1 == s2:
        return True
    c1 = s1.replace("-100", "").replace("-", "").strip()
    c2 = s2.replace("-100", "").replace("-", "").strip()
    if c1 and c2 and c1 == c2:
        return True
    if s1.replace("@", "") == s2.replace("@", ""):
        return True
    return False


@app.get("/api/messages")
async def get_messages(
    channel_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    settings = get_user_settings_from_db(user_id) if IS_SUPABASE_CONFIGURED else load_settings()

    target_channel = channel_id if (channel_id is not None and channel_id.strip() != "") else settings.get("source_channel_id", "all")
    if not target_channel:
        target_channel = "all"

    client = await telegram_manager.get_client(user_id)

    is_authed = False
    if client and client.is_connected():
        try:
            is_authed = await client.is_user_authorized()
        except Exception:
            is_authed = False

    # 1. Fetch live messages directly from Telegram if target_channel is specific channel
    if client and is_authed and target_channel and target_channel != "all":
        try:
            entity = await resolve_telegram_entity(client, target_channel)
            channel_title = getattr(entity, "title", None) or getattr(entity, "first_name", None) or f"Channel ({target_channel})"

            history = await client.get_messages(entity, limit=30)
            batch_map = {m.id: m for m in history}
            fetched_msgs = []

            source_setting = settings.get("source_channel_id", "all")
            dest_setting = settings.get("destination_channel_id", "")

            is_source = (str(target_channel).strip() == "all") or is_same_channel(target_channel, source_setting) or is_same_channel(getattr(entity, "id", None), source_setting)
            is_dest = is_same_channel(target_channel, dest_setting) or is_same_channel(getattr(entity, "id", None), dest_setting)

            for msg in history:
                if not msg.text and not msg.message and not msg.media:
                    continue
                raw_text = msg.text or msg.message or ""

                if is_dest or not is_source:
                    transformed_text = raw_text
                    should_forward = True
                    reason = "Destination message"
                else:
                    transformed_text, should_forward, reason = apply_text_transformation(raw_text, settings)

                has_media = bool(msg.media)
                media_type = "photo" if getattr(msg, "photo", None) else ("video" if getattr(msg, "video", None) else ("document" if getattr(msg, "document", None) else ("media" if msg.media else None)))

                is_reply = bool(msg.is_reply)
                reply_to_msg_id = getattr(msg, "reply_to_msg_id", None) or (msg.reply_to.reply_to_msg_id if getattr(msg, "reply_to", None) else None)
                reply_text = ""
                reply_sender = ""

                if is_reply and reply_to_msg_id:
                    parent = batch_map.get(reply_to_msg_id)
                    if parent:
                        reply_text = parent.raw_text or parent.message or ""
                        if not reply_text and parent.media:
                            p_media = "VIDEO" if getattr(parent, "video", None) else ("PHOTO" if getattr(parent, "photo", None) else ("DOCUMENT" if getattr(parent, "document", None) else "MEDIA"))
                            reply_text = f"[{p_media} Attachment]"
                        if parent.sender:
                            reply_sender = getattr(parent.sender, "first_name", "") or getattr(parent.sender, "title", "") or getattr(parent.sender, "username", "") or ""
                    else:
                        try:
                            parent_msg = await msg.get_reply_message()
                            if parent_msg:
                                reply_text = parent_msg.raw_text or parent_msg.message or ""
                                if not reply_text and parent_msg.media:
                                    p_media = "VIDEO" if getattr(parent_msg, "video", None) else ("PHOTO" if getattr(parent_msg, "photo", None) else ("DOCUMENT" if getattr(parent_msg, "document", None) else "MEDIA"))
                                    reply_text = f"[{p_media} Attachment]"
                                if parent_msg.sender:
                                    reply_sender = getattr(parent_msg.sender, "first_name", "") or getattr(parent_msg.sender, "title", "") or getattr(parent_msg.sender, "username", "") or ""
                        except Exception:
                            pass

                fetched_msgs.append({
                    "id": msg.id,
                    "chat_id": str(target_channel),
                    "chat_name": channel_title,
                    "raw_message": raw_text,
                    "transformed_message": transformed_text,
                    "has_media": has_media,
                    "media_type": media_type,
                    "is_reply": is_reply,
                    "reply_to_msg_id": reply_to_msg_id,
                    "reply_text": reply_text,
                    "reply_sender": reply_sender,
                    "date": msg.date.strftime("%Y-%m-%d %H:%M:%S") if msg.date else "",
                    "status": "synced" if should_forward else f"skipped ({reason})",
                    "telegram_posted": False
                })

            return {
                "success": True,
                "channel_id": str(target_channel),
                "chat_name": channel_title,
                "messages": fetched_msgs,
                "count": len(fetched_msgs)
            }
        except Exception as err:
            err_detail = f"Telegram error fetching channel {target_channel}: ({type(err).__name__}) {str(err)}"
            print(f"⚠️ {err_detail}")

    # 2. Fallback to Supabase sync logs strictly filtered by target_channel
    if IS_SUPABASE_CONFIGURED:
        db_logs = get_user_sync_logs_from_db(user_id, limit=100)
        if db_logs:
            formatted_logs = []
            for log in db_logs:
                if target_channel and target_channel != "all":
                    log_chat_id = str(log.get("chat_id", "")).replace("-100", "").replace("-", "")
                    clean_target = str(target_channel).replace("-100", "").replace("-", "")
                    if log_chat_id != clean_target:
                        continue
                formatted_logs.append({
                    "id": log.get("telegram_message_id"),
                    "chat_id": str(log.get("chat_id", "")),
                    "chat_name": log.get("chat_name", ""),
                    "raw_message": log.get("raw_message", ""),
                    "transformed_message": log.get("transformed_message", ""),
                    "date": str(log.get("created_at", ""))[:19].replace("T", " "),
                    "status": log.get("status", "synced"),
                    "webhook_url": log.get("webhook_url", "")
                })
            return {
                "success": True,
                "channel_id": str(target_channel),
                "chat_name": "Sync Logs",
                "messages": formatted_logs,
                "count": len(formatted_logs)
            }

    # 3. Fallback to in-memory messages
    messages = get_user_messages(user_id)
    if target_channel and target_channel != "all":
        clean_target = str(target_channel).replace("-100", "").replace("-", "")
        messages = [
            m for m in messages
            if str(m.get("chat_id", "")).replace("-100", "").replace("-", "") == clean_target
        ]

    return {
        "success": True,
        "channel_id": str(target_channel),
        "chat_name": "Local Cache",
        "messages": messages,
        "count": len(messages)
    }


@app.post("/api/settings")
async def update_settings(data: UpdateSettingsRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    new_data = {k: v for k, v in data.model_dump().items() if v is not None}

    print(f"[DEBUG] Saving configuration: Selected source={new_data.get('source_channel_id')}, Selected destination={new_data.get('destination_channel_id')}")

    if IS_SUPABASE_CONFIGURED:
        saved = save_user_settings_to_db(user_id, new_data)
    else:
        saved = save_settings(new_data)

    telegram_manager.update_settings_cache(user_id, saved)
    return {"success": True, "settings": saved}


@app.post("/api/send-message")
async def send_manual_message(data: SendMessageRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    client = await telegram_manager.get_client(user_id)

    if not client or not client.is_connected():
        raise HTTPException(status_code=400, detail="Telegram account not connected.")

    try:
        target_chat = int(data.chat_id) if (str(data.chat_id).isdigit() or str(data.chat_id).startswith("-")) else data.chat_id
        entity = await client.get_entity(target_chat)
        msg = await client.send_message(entity, data.text)
        return {
            "success": True,
            "message_id": msg.id,
            "chat_id": data.chat_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to send Telegram message: {str(e)}")


@app.post("/api/test-transform")
async def test_transform_endpoint(data: TestTransformRequest):
    settings = data.model_dump()
    transformed, should_forward, reason = apply_text_transformation(data.sample_text, settings)
    return {
        "raw_text": data.sample_text,
        "transformed_text": transformed,
        "should_forward": should_forward,
        "reason": reason
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(PORT), reload=False)
