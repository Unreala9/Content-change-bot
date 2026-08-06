import os
import sys
import re
import asyncio
from typing import Optional, List, Dict, Any

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends
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
    if filter_mode == "allow_only" and keyword_filter:
        keywords = [k.strip().lower() for k in keyword_filter.split(",") if k.strip()]
        text_lower = text.lower()
        if not any(kw in text_lower for kw in keywords):
            return text, False, f"Keyword missing (filter: '{keyword_filter}')"

    if filter_mode == "block_any" and keyword_filter:
        keywords = [k.strip().lower() for k in keyword_filter.split(",") if k.strip()]
        text_lower = text.lower()
        if any(kw in text_lower for kw in keywords):
            return text, False, f"Blocked keyword found in message (filter: '{keyword_filter}')"

    transformed = text

    # 1. Multiple Structured Replacement Rules
    replacement_rules = settings.get("replacement_rules", [])
    if isinstance(replacement_rules, list):
        for rule in replacement_rules:
            if isinstance(rule, dict):
                find_val = rule.get("find", "")
                replace_val = rule.get("replace", "")
                if find_val:
                    transformed = transformed.replace(find_val, replace_val)

    # 2. Quick Comma-Separated Replacement Mode (Fallback)
    find_str = settings.get("find_text", "").strip()
    replace_str = settings.get("replace_text", "").strip()

    if find_str and replace_str:
        find_list = [f.strip() for f in find_str.split(",") if f.strip()]
        replace_list = [r.strip() for r in replace_str.split(",") if r.strip()]

        for i, target in enumerate(find_list):
            rep = replace_list[i] if i < len(replace_list) else (replace_list[-1] if replace_list else "")
            transformed = transformed.replace(target, rep)

    # 3. Link Handling Engine
    url_pattern = r'https?://[^\s]+'

    if settings.get("remove_all_links", False):
        transformed = re.sub(url_pattern, '', transformed)
    elif settings.get("override_all_links", False):
        custom_url = settings.get("custom_link_url", "").strip()
        if custom_url:
            transformed = re.sub(url_pattern, custom_url, transformed)

    # 4. Text Prefix & Suffix Formatting
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
    yield
    await telegram_manager.stop()


# --- FastAPI App ---
app = FastAPI(title="Telegram Sync Hub VPS Backend API", lifespan=lifespan)

# Enable CORS for Decoupled Frontend Deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Telegram Sync Hub VPS Backend API",
        "docs": "/docs"
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
    user_id = current_user["id"]
    client = await telegram_manager.get_client_for_user(user_id)

    is_authorized = False
    tg_user = None

    if client:
        try:
            if client.is_connected() and await client.is_user_authorized():
                is_authorized = True
                me = await client.get_me()
                tg_user = {
                    "id": me.id,
                    "first_name": me.first_name,
                    "username": me.username or "",
                    "phone": me.phone or ""
                }
        except Exception as e:
            print(f"Error checking status for user {user_id}: {e}")

    settings = get_user_settings_from_db(user_id) if IS_SUPABASE_CONFIGURED else load_settings()
    stats = get_user_stats(user_id)
    subscription = get_user_subscription_from_db(user_id)

    return {
        "connected": bool(client and client.is_connected()),
        "authorized": is_authorized,
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
    if not IS_SUPABASE_CONFIGURED:
        return True
    sub = get_user_subscription_from_db(user_id)
    if sub.get("status") != "active" or sub.get("plan_id") not in ["plan_599", "plan_799"]:
        raise HTTPException(
            status_code=403,
            detail="🔒 Subscription Required: Active Basic Plan (₹599) or Pro Plan (₹799) is required to connect your Telegram account."
        )


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


@app.post("/api/auth/logout-telegram")
async def logout_telegram(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    return await telegram_manager.logout_user_telegram(user_id)


@app.get("/api/channels")
async def get_channels(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    client = await telegram_manager.get_client_for_user(user_id)

    if not client or not client.is_connected() or not await client.is_user_authorized():
        return {"success": False, "channels": [], "detail": "Telegram not authorized"}

    try:
        dialogs = await client.get_dialogs()
        channels = []
        for d in dialogs:
            chat_type = "user"
            if d.is_channel:
                chat_type = "channel"
            elif d.is_group:
                chat_type = "group"

            channels.append({
                "id": d.id,
                "name": d.title or d.name or "Private Chat",
                "type": chat_type,
                "unread_count": d.unread_count
            })

        return {"success": True, "channels": channels}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/messages")
async def get_messages(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    if IS_SUPABASE_CONFIGURED:
        db_logs = get_user_sync_logs_from_db(user_id, limit=100)
        if db_logs:
            formatted_logs = []
            for log in db_logs:
                formatted_logs.append({
                    "id": log.get("telegram_message_id"),
                    "chat_id": log.get("chat_id"),
                    "chat_name": log.get("chat_name", ""),
                    "raw_message": log.get("raw_message", ""),
                    "transformed_message": log.get("transformed_message", ""),
                    "date": str(log.get("created_at", ""))[:19].replace("T", " "),
                    "status": log.get("status", "synced"),
                    "webhook_url": log.get("webhook_url", "")
                })
            return {"success": True, "messages": formatted_logs}

    messages = get_user_messages(user_id)
    return {"success": True, "messages": messages}


@app.post("/api/settings")
async def update_settings(data: UpdateSettingsRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    new_data = {k: v for k, v in data.model_dump().items() if v is not None}

    if IS_SUPABASE_CONFIGURED:
        saved = save_user_settings_to_db(user_id, new_data)
    else:
        saved = save_settings(new_data)

    return {"success": True, "settings": saved}


@app.post("/api/send-message")
async def send_manual_message(data: SendMessageRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    client = await telegram_manager.get_client_for_user(user_id)

    if not client or not client.is_connected() or not await client.is_user_authorized():
        raise HTTPException(status_code=400, detail="Telegram client is not authorized.")

    try:
        chat_target = data.chat_id
        if isinstance(chat_target, str) and (chat_target.isdigit() or chat_target.startswith("-")):
            chat_target = int(chat_target)

        entity = await client.get_entity(chat_target)
        sent = await client.send_message(entity=entity, message=data.text)
        return {"success": True, "message_id": sent.id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/test-transform")
async def test_transform(data: TestTransformRequest):
    settings_dict = data.model_dump()
    transformed, should_forward, reason = apply_text_transformation(data.sample_text, settings_dict)
    return {
        "original_text": data.sample_text,
        "transformed_text": transformed,
        "should_forward": should_forward,
        "reason": reason
    }


# --- Subscription & Payment Endpoints (Fallback if Edge Function is disabled) ---

PLANS_CONFIG = {
    "plan_599": {"name": "Basic Plan (₹599)", "amount": 59900, "currency": "INR", "price": 599},
    "plan_799": {"name": "Pro Plan (₹799)", "amount": 79900, "currency": "INR", "price": 799}
}


@app.get("/api/subscription/status")
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    sub = get_user_subscription_from_db(user_id)
    return {"success": True, "subscription": sub}


@app.post("/api/subscription/create-order")
async def create_subscription_order(data: CreateRazorpayOrderRequest, current_user: dict = Depends(get_current_user)):
    if data.plan_id not in PLANS_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid plan selected.")

    plan = PLANS_CONFIG[data.plan_id]

    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay credentials are not configured in backend environment variables.")

    try:
        url = "https://api.razorpay.com/v1/orders"
        auth = (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
        payload = {
            "amount": plan["amount"],
            "currency": plan["currency"],
            "receipt": f"sub_{current_user['id'][:8]}_{int(asyncio.get_event_loop().time())}",
            "notes": {
                "user_id": current_user["id"],
                "plan_id": data.plan_id,
                "plan_name": plan["name"]
            }
        }
        res = requests.post(url, json=payload, auth=auth, timeout=10)
        res_data = res.json()

        if res.status_code != 200 or "id" not in res_data:
            raise Exception(res_data.get("error", {}).get("description", "Failed to create Razorpay order."))

        return {
            "success": True,
            "order_id": res_data["id"],
            "key_id": RAZORPAY_KEY_ID,
            "amount": plan["amount"],
            "currency": plan["currency"],
            "plan_name": plan["name"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subscription/verify-payment")
async def verify_subscription_payment(data: VerifyRazorpayPaymentRequest, current_user: dict = Depends(get_current_user)):
    if not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=500, detail="RAZORPAY_KEY_SECRET is not configured.")

    try:
        signature_body = f"{data.razorpay_order_id}|{data.razorpay_payment_id}"
        expected_signature = hmac.new(
            RAZORPAY_KEY_SECRET.encode("utf-8"),
            signature_body.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        if expected_signature != data.razorpay_signature:
            raise HTTPException(status_code=400, detail="Invalid Razorpay payment signature! Payment verification failed.")

        user_id = data.user_id or current_user["id"]
        plan = PLANS_CONFIG.get(data.plan_id, {"name": "Paid Plan", "price": 599})

        sub_update = {
            "user_id": user_id,
            "plan_id": data.plan_id,
            "plan_name": plan["name"],
            "amount_paid": plan["price"],
            "status": "active",
            "razorpay_order_id": data.razorpay_order_id,
            "razorpay_payment_id": data.razorpay_payment_id
        }

        saved_sub = update_user_subscription_in_db(user_id, sub_update)

        return {
            "success": True,
            "message": f"🎉 Payment verified! {plan['name']} activated successfully.",
            "subscription": saved_sub
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
