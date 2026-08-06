import os
import sys
import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import IS_SUPABASE_CONFIGURED, SUPABASE_URL, SUPABASE_ANON_KEY
from supabase_client import (
    get_current_user,
    get_user_settings_from_db,
    save_user_settings_to_db,
    get_user_profile_from_db,
    get_user_sync_logs_from_db,
    supabase
)
from telegram_manager import telegram_manager, apply_text_transformation, to_ist

# Fix Windows terminal UTF-8 encoding
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass


# --- Request Schemas ---
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
    forward_media: Optional[bool] = None
    replace_media: Optional[bool] = None
    custom_media_url: Optional[str] = None


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
    forward_media: Optional[bool] = True
    replace_media: Optional[bool] = False
    custom_media_url: Optional[str] = ""


class UserAuthRequest(BaseModel):
    email: str
    password: str


# --- FastAPI Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Telegram Sync Hub...")
    try:
        await telegram_manager.init_all_users()
    except Exception as e:
        print(f"⚠️ Telegram Manager initialization note: {e}")
    yield
    print("🔌 Stopping Telegram Sync Hub...")
    await telegram_manager.shutdown()
    print("✅ Stopped!")


# --- FastAPI App ---
app = FastAPI(title="Telegram Sync Hub & Multi-User Side-by-Side Studio", lifespan=lifespan)

# Static files
os.makedirs("static", exist_ok=True)
os.makedirs(os.path.join("static", "media"), exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/login")
async def login_page():
    return FileResponse("static/login.html")


@app.get("/signup")
async def signup_page():
    return FileResponse("static/login.html")


# --- Supabase User Auth Endpoints ---

@app.post("/api/user/signup")
async def user_signup(credentials: UserAuthRequest):
    if not IS_SUPABASE_CONFIGURED or not supabase:
        raise HTTPException(
            status_code=400,
            detail="Supabase credentials are not configured in .env file. Please add SUPABASE_URL and SUPABASE_ANON_KEY."
        )
    try:
        res = supabase.auth.sign_up({"email": credentials.email, "password": credentials.password})
        if res.user:
            session_data = res.session.model_dump() if res.session else None
            return {
                "success": True,
                "message": "User registered successfully!",
                "user": {"id": res.user.id, "email": res.user.email},
                "session": session_data
            }
        raise HTTPException(status_code=400, detail="Signup failed.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/user/login")
async def user_login(credentials: UserAuthRequest):
    if not IS_SUPABASE_CONFIGURED or not supabase:
        raise HTTPException(
            status_code=400,
            detail="Supabase credentials are not configured in .env file. Please add SUPABASE_URL and SUPABASE_ANON_KEY."
        )
    try:
        res = supabase.auth.sign_in_with_password({"email": credentials.email, "password": credentials.password})
        if res.user and res.session:
            return {
                "success": True,
                "access_token": res.session.access_token,
                "refresh_token": res.session.refresh_token,
                "user": {"id": res.user.id, "email": res.user.email}
            }
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Protected REST API Endpoints ---

@app.get("/api/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    client = telegram_manager.get_client(user_id)

    connected = False
    is_user_authorized = False
    me_info = None

    if client and client.is_connected():
        connected = True
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
            print(f"Error checking Telegram user auth: {e}")

    # Load Supabase profile if client is not actively loaded yet
    if not me_info and IS_SUPABASE_CONFIGURED:
        profile = get_user_profile_from_db(user_id)
        if profile and profile.get("telegram_user_id"):
            is_user_authorized = True
            me_info = {
                "id": profile.get("telegram_user_id"),
                "first_name": profile.get("telegram_first_name", ""),
                "username": profile.get("telegram_username", ""),
                "phone": profile.get("telegram_phone", "")
            }

    container = telegram_manager.get_user_container(user_id)
    stats = container.stats if container else {"received": 0, "forwarded": 0, "filtered": 0, "errors": 0}
    settings = get_user_settings_from_db(user_id)

    return {
        "connected": connected,
        "authorized": is_user_authorized,
        "user": me_info,
        "stats": stats,
        "settings": settings,
        "supabase_configured": IS_SUPABASE_CONFIGURED,
        "supabase_url": SUPABASE_URL if IS_SUPABASE_CONFIGURED else "",
        "supabase_anon_key": SUPABASE_ANON_KEY if IS_SUPABASE_CONFIGURED else "",
        "current_user_email": current_user.get("email", "")
    }


@app.post("/api/auth/send-code")
async def send_auth_code(data: SendCodeRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    return await telegram_manager.send_auth_code(user_id, data.phone_number)


@app.post("/api/auth/verify-code")
async def verify_auth_code(data: VerifyCodeRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    return await telegram_manager.verify_auth_code(user_id, data.phone_number, data.code, data.password)


@app.post("/api/auth/disconnect")
async def disconnect_telegram_account(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    return await telegram_manager.disconnect_user(user_id)


@app.get("/api/channels")
async def get_channels(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    client = telegram_manager.get_client(user_id)

    if not client or not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram client not connected for this account. Please connect your Telegram account first.")

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
    client = telegram_manager.get_client(user_id)

    if not client or not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram client not connected")

    try:
        target = int(chat_id) if (chat_id.isdigit() or chat_id.startswith("-")) else chat_id
        entity = await client.get_entity(target)
        messages = []
        async for msg in client.iter_messages(entity, limit=limit):
            media_path = None
            if msg.media:
                # Search if file is already downloaded in static/media
                prefix = f"{chat_id}_{msg.id}"
                media_dir = os.path.join("static", "media")
                found_file = None
                if os.path.exists(media_dir):
                    try:
                        for file_name in os.listdir(media_dir):
                            if file_name.startswith(prefix):
                                found_file = file_name
                                break
                    except Exception:
                        pass
                if found_file:
                    media_path = f"/static/media/{found_file}"
                else:
                    media_path = await download_message_media(msg, chat_id)

            messages.append({
                "id": msg.id,
                "text": msg.text or "",
                "date": to_ist(msg.date) if msg.date else "",
                "media_path": media_path,
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
    client = telegram_manager.get_client(user_id)

    if not client or not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram client not connected")

    try:
        chat_id = int(data.destination_chat_id) if (isinstance(data.destination_chat_id, str) and (data.destination_chat_id.isdigit() or data.destination_chat_id.startswith("-"))) else data.destination_chat_id
        entity = await client.get_entity(chat_id)
        await client.send_message(entity=entity, message=data.message)
        return {"success": True, "destination": data.destination_chat_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config")
async def get_config(current_user: dict = Depends(get_current_user)):
    return get_user_settings_from_db(current_user["id"])


@app.post("/api/config")
async def update_config(data: UpdateSettingsRequest, current_user: dict = Depends(get_current_user)):
    updates = data.dict(exclude_unset=True)
    saved = save_user_settings_to_db(current_user["id"], updates)
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
async def get_messages(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    container = telegram_manager.get_user_container(user_id)

    if IS_SUPABASE_CONFIGURED:
        db_logs = get_user_sync_logs_from_db(user_id, limit=100)
        messages_list = db_logs if db_logs else (list(container.recent_messages) if container else [])
    else:
        messages_list = list(container.recent_messages) if container else []

    stats = container.stats if container else {"received": 0, "forwarded": 0, "filtered": 0, "errors": 0}

    return {
        "success": True,
        "messages": messages_list,
        "stats": stats
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)