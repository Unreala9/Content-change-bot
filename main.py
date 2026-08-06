import os
import sys
import re
import asyncio
from typing import Optional, List, Dict, Any

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import (
    API_ID,
    API_HASH,
    SESSION_NAME,
    PORT,
    IS_SUPABASE_CONFIGURED,
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
    get_user_sync_logs_from_db
)
from telegram_manager import (
    telegram_manager,
    get_user_messages,
    get_user_stats
)

# Fix Windows terminal UTF-8 encoding
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass


# --- Request Schemas ---
class UserAuthRequest(BaseModel):
    email: str
    password: str


class SendMessageRequest(BaseModel):
    destination_chat_id: str | int
    message: str


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


# --- Text Transformation & Filtering Engine ---
def apply_text_transformation(text: str, settings: dict) -> tuple[str, bool, str]:
    """
    Applies find/replace (multi-rule & comma-separated), link modifications, prefix/suffix, and keyword filter.
    Returns: (transformed_text, should_forward, filter_reason)
    """
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

    # 1. Multiple Structured Replacement Rules (List of {"find": "...", "replace": "..."})
    rules = settings.get("replacement_rules", [])
    if isinstance(rules, list):
        for rule in rules:
            if isinstance(rule, dict):
                find_val = rule.get("find", "")
                replace_val = rule.get("replace", "")
                if find_val:
                    transformed = transformed.replace(find_val, replace_val)

    # 2. Comma-separated find_text & replace_text (Bulk multi-word mapping support)
    find_text = settings.get("find_text", "")
    replace_text = settings.get("replace_text", "")
    if find_text:
        find_list = [f.strip() for f in find_text.split(",") if f.strip()]
        replace_list = [r.strip() for r in replace_text.split(",")]
        for i, f_word in enumerate(find_list):
            r_word = replace_list[i] if i < len(replace_list) else (replace_list[-1] if replace_list else "")
            if f_word:
                transformed = transformed.replace(f_word, r_word)

    # 3. Smart Link Modifier Engine (Universal URL Override / Link Removal)
    remove_all_links = settings.get("remove_all_links", False)
    override_all_links = settings.get("override_all_links", False)
    custom_link_url = settings.get("custom_link_url", "").strip()

    url_pattern = r'https?://[^\s<>"\'\)]+'

    if remove_all_links:
        transformed = re.sub(url_pattern, '', transformed)
    elif override_all_links and custom_link_url:
        transformed = re.sub(url_pattern, custom_link_url, transformed)

    # 4. Prefix & Suffix
    prefix = settings.get("text_prefix", "")
    suffix = settings.get("text_suffix", "")

    if prefix:
        transformed = f"{prefix}{transformed}"
    if suffix:
        transformed = f"{transformed}{suffix}"

    return transformed, True, "Passed"


# --- FastAPI Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    await telegram_manager.start()
    yield
    await telegram_manager.stop()


# --- FastAPI App ---
app = FastAPI(title="Telegram Sync Hub & Multi-User Studio", lifespan=lifespan)

# Mount static files
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/login")
async def login_page():
    return FileResponse("static/login.html")


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
    user_id = current_user["id"]
    client = await telegram_manager.get_client_for_user(user_id)

    connected = client.is_connected() if client else False
    is_user_authorized = False
    me_info = None

    if client and connected:
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
            print(f"Error reading auth status for user {user_id}: {e}")

    settings = get_user_settings_from_db(user_id) if IS_SUPABASE_CONFIGURED else load_settings()
    stats = get_user_stats(user_id)

    return {
        "connected": connected,
        "authorized": is_user_authorized,
        "user": me_info,
        "account": current_user,
        "stats": stats,
        "settings": settings,
        "supabase_configured": IS_SUPABASE_CONFIGURED
    }


@app.post("/api/auth/send-code")
async def send_auth_code(data: SendCodeRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    try:
        res = await telegram_manager.send_auth_code(user_id, data.phone_number)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/verify-code")
async def verify_auth_code(data: VerifyCodeRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    try:
        res = await telegram_manager.verify_auth_code(
            user_id=user_id,
            phone_number=data.phone_number,
            code=data.code,
            password=data.password
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/logout-telegram")
async def logout_telegram(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    try:
        res = await telegram_manager.logout_user_telegram(user_id)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))



@app.get("/api/channels")
async def get_channels(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    client = await telegram_manager.get_client_for_user(user_id)

    if not client or not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram client not connected for your account.")

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


@app.get("/api/history/{chat_id}")
async def get_chat_history(chat_id: str, limit: int = 30, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    client = await telegram_manager.get_client_for_user(user_id)

    if not client or not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram client not connected for your account.")

    try:
        target = int(chat_id) if (chat_id.isdigit() or chat_id.startswith("-")) else chat_id
        entity = await client.get_entity(target)
        messages = []
        async for msg in client.iter_messages(entity, limit=limit):
            messages.append({
                "id": msg.id,
                "text": msg.text or "",
                "date": msg.date.strftime("%Y-%m-%d %H:%M:%S") if msg.date else "",
                "sender_id": msg.sender_id,
                "out": msg.out
            })
        return {"success": True, "chat_id": chat_id, "messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/send")
async def send_message(data: SendMessageRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    client = await telegram_manager.get_client_for_user(user_id)

    if not client or not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram client not connected for your account.")

    try:
        chat_id = int(data.destination_chat_id) if (isinstance(data.destination_chat_id, str) and (data.destination_chat_id.isdigit() or data.destination_chat_id.startswith("-"))) else data.destination_chat_id
        entity = await client.get_entity(chat_id)
        await client.send_message(entity=entity, message=data.message)
        return {"success": True, "destination": data.destination_chat_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config")
async def get_config(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    if IS_SUPABASE_CONFIGURED:
        return get_user_settings_from_db(user_id)
    return load_settings()


@app.post("/api/config")
async def update_config(data: UpdateSettingsRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    updates = data.dict(exclude_unset=True)
    if IS_SUPABASE_CONFIGURED:
        saved = save_user_settings_to_db(user_id, updates)
    else:
        saved = save_settings(updates)
    return {"success": True, "settings": saved}


@app.post("/api/test-transform")
async def test_transform(data: TestTransformRequest, current_user: dict = Depends(get_current_user)):
    settings = data.dict()
    transformed, should_forward, reason = apply_text_transformation(data.sample_text, settings)
    return {
        "original_text": data.sample_text,
        "transformed_text": transformed,
        "should_forward": should_forward,
        "reason": reason
    }


@app.get("/api/messages")
async def get_messages(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    in_memory = get_user_messages(user_id)
    db_logs = get_user_sync_logs_from_db(user_id) if IS_SUPABASE_CONFIGURED else []
    stats = get_user_stats(user_id)

    # Combine in-memory and DB logs gracefully
    combined_messages = list(in_memory)
    if db_logs and len(combined_messages) == 0:
        for row in db_logs:
            combined_messages.append({
                "id": row.get("telegram_message_id"),
                "chat_id": row.get("chat_id"),
                "chat_name": row.get("chat_name"),
                "raw_message": row.get("raw_message"),
                "transformed_message": row.get("transformed_message"),
                "date": str(row.get("created_at", "")),
                "status": row.get("status"),
                "reason": row.get("reason"),
                "webhook_url": row.get("webhook_url"),
                "telegram_posted": row.get("telegram_posted")
            })

    return {
        "success": True,
        "messages": combined_messages,
        "stats": stats
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)