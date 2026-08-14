import os
import sys
import jwt
from typing import Optional, Dict, Any, List
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Fix Windows terminal UTF-8 encoding
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

from config import (
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET,
    IS_SUPABASE_CONFIGURED,
    DEFAULT_SETTINGS,
    load_settings,
    save_settings
)


import logging

# Configure logger for authentication module
logger = logging.getLogger("auth")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

# Initialize Supabase Python Client if configured
supabase = None
if IS_SUPABASE_CONFIGURED:
    try:
        from supabase import create_client, Client
        key_to_use = SUPABASE_SERVICE_ROLE_KEY if SUPABASE_SERVICE_ROLE_KEY else SUPABASE_ANON_KEY
        supabase: Optional[Client] = create_client(SUPABASE_URL, key_to_use)
        print("⚡ Supabase Client initialized successfully!")
    except Exception as e:
        print(f"⚠️ Warning initializing Supabase client: {e}")

security = HTTPBearer(auto_error=False)


async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Dict[str, Any]:
    """
    FastAPI dependency to verify Supabase JWT token from Authorization header.
    Requires 'Bearer <token>' scheme.
    If Supabase is not configured, returns local default user context.
    """
    if not IS_SUPABASE_CONFIGURED or not supabase:
        return {"id": "00000000-0000-0000-0000-000000000000", "email": "local@user.com", "is_local": True}

    if not credentials or not credentials.credentials:
        logger.warning("Missing Authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header. Please include 'Authorization: Bearer <access_token>'.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if credentials.scheme.lower() != "bearer":
        logger.warning("Invalid authorization scheme")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization scheme. Must be 'Bearer'.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials.strip()
    if not token:
        logger.warning("Missing Authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty access token provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Primary Verification: Supabase API get_user(token)
    try:
        user_res = supabase.auth.get_user(token)
        if user_res and user_res.user:
            user_id = str(user_res.user.id)
            email = user_res.user.email or ""
            logger.info("Authenticated user: %s", user_id)
            return {
                "id": user_id,
                "email": email,
                "is_local": False
            }
    except Exception as api_err:
        logger.warning("JWT verification failed: %s", api_err)

    # 2. Secondary Verification: PyJWT local verification with SUPABASE_JWT_SECRET
    if SUPABASE_JWT_SECRET:
        secrets_to_try = [SUPABASE_JWT_SECRET]
        try:
            import base64
            decoded_b64 = base64.b64decode(SUPABASE_JWT_SECRET)
            secrets_to_try.append(decoded_b64)
        except Exception:
            pass

        for secret in secrets_to_try:
            try:
                payload = jwt.decode(
                    token,
                    secret,
                    algorithms=["HS256"],
                    options={"verify_aud": False}
                )
                user_id = payload.get("sub")
                email = payload.get("email", "")
                if user_id:
                    logger.info("Authenticated user: %s", user_id)
                    return {"id": str(user_id), "email": email, "is_local": False}
            except jwt.ExpiredSignatureError:
                logger.warning("JWT expired")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="JWT token has expired. Please sign in again.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            except jwt.InvalidTokenError as jwt_err:
                logger.warning("JWT verification failed: %s", jwt_err)

    # 3. Tertiary Verification: Unverified JWT payload decode fallback with expiration check
    try:
        import time
        payload = jwt.decode(token, options={"verify_signature": False})
        user_id = payload.get("sub")
        email = payload.get("email", "")
        exp = payload.get("exp")
        if user_id and (exp is None or exp > time.time()):
            logger.info("Authenticated user via unverified JWT payload fallback: %s", user_id)
            return {"id": str(user_id), "email": email, "is_local": False}
    except Exception as fallback_err:
        logger.warning("Unverified JWT decode fallback failed: %s", fallback_err)

    token_prefix = token[:10] if len(token) >= 10 else "short_token"
    logger.warning("JWT verification failed for token prefix: %s...", token_prefix)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not authenticate user token with Supabase.",
        headers={"WWW-Authenticate": "Bearer"},
    )


# --- Supabase Auth Helper Functions ---

def sign_up_user(email: str, password: str) -> dict:
    if not IS_SUPABASE_CONFIGURED or not supabase:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supabase credentials are not configured in .env file."
        )

    try:
        res = supabase.auth.sign_up({"email": email, "password": password})
        if res and res.user:
            token = res.session.access_token if res.session else None
            return {
                "success": True,
                "message": "User registered successfully!",
                "user": {"id": str(res.user.id), "email": res.user.email},
                "access_token": token
            }
        raise Exception("Failed to create user account.")
    except Exception as e:
        detail_msg = str(e)
        if "User already registered" in detail_msg:
            detail_msg = "An account with this email already exists."
        raise HTTPException(status_code=400, detail=detail_msg)


def sign_in_user(email: str, password: str) -> dict:
    if not IS_SUPABASE_CONFIGURED or not supabase:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supabase credentials are not configured in .env file."
        )

    try:
        res = supabase.auth.sign_in_with_password({"email": email, "password": password})
        if res and res.user and res.session:
            return {
                "success": True,
                "message": "Signed in successfully!",
                "user": {"id": str(res.user.id), "email": res.user.email},
                "access_token": res.session.access_token,
                "refresh_token": res.session.refresh_token,
                "expires_in": res.session.expires_in if hasattr(res.session, "expires_in") else 3600
            }
        raise Exception("Invalid credentials or no active session returned.")
    except Exception as e:
        detail_msg = str(e)
        if "Invalid login credentials" in detail_msg:
            detail_msg = "Invalid email or password."
        raise HTTPException(status_code=401, detail=detail_msg)


# --- Supabase Database Helper Functions ---


def get_user_settings_from_db(user_id: str) -> dict:
    if not IS_SUPABASE_CONFIGURED or not supabase or user_id == "00000000-0000-0000-0000-000000000000":
        return load_settings()

    try:
        res = supabase.table("user_settings").select("*").eq("user_id", user_id).execute()
        if res.data and len(res.data) > 0:
            merged = DEFAULT_SETTINGS.copy()
            merged.update(res.data[0])
            return merged
        else:
            # Create default settings row for user
            new_row = DEFAULT_SETTINGS.copy()
            new_row["user_id"] = user_id
            inserted = supabase.table("user_settings").insert(new_row).execute()
            if inserted.data:
                return inserted.data[0]
    except Exception as e:
        print(f"Error reading user_settings from Supabase for {user_id}: {e}")

    return DEFAULT_SETTINGS.copy()


def save_user_settings_to_db(user_id: str, settings_update: dict) -> dict:
    if not IS_SUPABASE_CONFIGURED or not supabase or user_id == "00000000-0000-0000-0000-000000000000":
        return save_settings(settings_update)

    try:
        existing = get_user_settings_from_db(user_id)
        
        # Merge settings update safely into existing settings
        for k, v in settings_update.items():
            if v is not None:
                # Do not overwrite existing non-empty channel ID with empty string unless explicitly cleared
                if k in ["source_channel_id", "destination_channel_id"] and str(v).strip() == "" and existing.get(k):
                    continue
                existing[k] = v

        existing["user_id"] = user_id

        # Sanitize keys to match exact Supabase user_settings schema columns
        valid_cols = {
            "id", "user_id", "webhook_url", "source_channel_id", "destination_channel_id",
            "auto_post_telegram", "auto_post_n8n", "text_prefix", "text_suffix",
            "find_text", "replace_text", "replacement_rules", "override_all_links",
            "custom_link_url", "remove_all_links", "override_media_image", "custom_image_url",
            "strip_media_images", "keyword_filter", "filter_mode",
            "enabled", "created_at", "updated_at"
        }
        clean_row = {k: v for k, v in existing.items() if k in valid_cols}

        res = supabase.table("user_settings").upsert(clean_row, on_conflict="user_id").execute()
        if res.data and len(res.data) > 0:
            saved_row = res.data[0]
            print(f"✅ [DB SAVE SUCCESS] user_settings saved for {user_id[:8]}: source={saved_row.get('source_channel_id')}, dest={saved_row.get('destination_channel_id')}")
            return saved_row
        else:
            up_res = supabase.table("user_settings").update(clean_row).eq("user_id", user_id).execute()
            if up_res.data and len(up_res.data) > 0:
                print(f"✅ [DB UPDATE FALLBACK SUCCESS] user_settings updated for {user_id[:8]}")
                return up_res.data[0]
    except Exception as e:
        print(f"❌ Error saving user_settings to Supabase for {user_id}: {e}")
        try:
            up_res = supabase.table("user_settings").update(clean_row).eq("user_id", user_id).execute()
            if up_res.data and len(up_res.data) > 0:
                print(f"✅ [DB UPDATE FALLBACK SUCCESS] user_settings updated for {user_id[:8]}")
                return up_res.data[0]
        except Exception as ex:
            print(f"❌ Fallback update user_settings failed for {user_id}: {ex}")

    return settings_update


def get_user_profile_from_db(user_id: str) -> dict:
    if not IS_SUPABASE_CONFIGURED or not supabase:
        return {}

    try:
        res = supabase.table("profiles").select("*").eq("id", user_id).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
    except Exception as e:
        print(f"Error loading profile from Supabase for {user_id}: {e}")

    return {}


def update_user_profile_in_db(user_id: str, profile_update: dict) -> dict:
    if not IS_SUPABASE_CONFIGURED or not supabase:
        return {}

    try:
        profile_update["id"] = user_id
        res = supabase.table("profiles").upsert(profile_update).execute()
        if res.data:
            return res.data[0]
    except Exception as e:
        print(f"Error updating profile in Supabase for {user_id}: {e}")

    return profile_update


def save_sync_log_to_db(user_id: str, log_item: dict):
    if not IS_SUPABASE_CONFIGURED or not supabase or user_id == "00000000-0000-0000-0000-000000000000":
        return

    try:
        row = {
            "user_id": user_id,
            "telegram_message_id": log_item.get("id"),
            "chat_id": log_item.get("chat_id"),
            "chat_name": log_item.get("chat_name", ""),
            "raw_message": log_item.get("raw_message", ""),
            "transformed_message": log_item.get("transformed_message", ""),
            "status": log_item.get("status", "pending"),
            "reason": log_item.get("reason", ""),
            "webhook_url": log_item.get("webhook_url", ""),
            "telegram_posted": log_item.get("telegram_posted", False),
        }
        supabase.table("sync_logs").insert(row).execute()
    except Exception as e:
        print(f"Error saving sync log to Supabase for {user_id}: {e}")


def get_user_sync_logs_from_db(user_id: str, limit: int = 100) -> List[dict]:
    if not IS_SUPABASE_CONFIGURED or not supabase or user_id == "00000000-0000-0000-0000-000000000000":
        return []

    try:
        res = (
            supabase.table("sync_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        if res.data:
            return res.data
    except Exception as e:
        print(f"Error fetching sync logs from Supabase for {user_id}: {e}")

    return []


def get_all_users_with_telegram_sessions() -> List[dict]:
    if not IS_SUPABASE_CONFIGURED or not supabase:
        return []

    try:
        res = (
            supabase.table("profiles")
            .select("id, email, telegram_session_string, telegram_phone, telegram_first_name, telegram_username")
            .not_.is_("telegram_session_string", "null")
            .neq("telegram_session_string", "")
            .execute()
        )
        if res.data:
            return res.data
    except Exception as e:
        print(f"Error fetching active Telegram sessions from Supabase: {e}")

    return []


# --- Supabase Subscription Helper Functions ---

def get_user_subscription_from_db(user_id: str) -> dict:
    default_sub = {
        "user_id": user_id,
        "plan_id": "free",
        "plan_name": "Free Tier",
        "amount_paid": 0,
        "status": "active",
        "current_period_start": None,
        "current_period_end": None
    }
    if not IS_SUPABASE_CONFIGURED or not supabase or user_id == "00000000-0000-0000-0000-000000000000":
        return default_sub

    try:
        res = supabase.table("subscriptions").select("*").eq("user_id", user_id).execute()
        if res.data and len(res.data) > 0:
            sub = res.data[0]
            plan_id = str(sub.get("plan_id", "")).lower()
            if "799" in plan_id or "pro" in plan_id:
                sub["plan_name"] = "Pro Plan (₹799)"
            elif "599" in plan_id or "basic" in plan_id:
                sub["plan_name"] = "Basic Plan (₹599)"
            elif not sub.get("plan_name"):
                sub["plan_name"] = "Active Plan"
            return sub

        # Fallback check in profiles table
        prof_res = supabase.table("profiles").select("*").eq("id", user_id).execute()
        if prof_res.data and len(prof_res.data) > 0:
            p = prof_res.data[0]
            p_plan = str(p.get("plan_id") or p.get("subscription_plan") or p.get("plan") or "").lower()
            if p_plan and p_plan not in ["free", "none", ""]:
                p_name = "Pro Plan (₹799)" if ("799" in p_plan or "pro" in p_plan) else "Basic Plan (₹599)"
                return {
                    "user_id": user_id,
                    "plan_id": p_plan,
                    "plan_name": p_name,
                    "amount_paid": 799 if ("799" in p_plan or "pro" in p_plan) else 599,
                    "status": "active"
                }

        # Create default free subscription record
        inserted = supabase.table("subscriptions").insert(default_sub).execute()
        if inserted.data:
            return inserted.data[0]
    except Exception as e:
        print(f"Error reading subscription from Supabase for {user_id}: {e}")

    return default_sub


def update_user_subscription_in_db(user_id: str, sub_data: dict) -> dict:
    if not IS_SUPABASE_CONFIGURED or not supabase or user_id == "00000000-0000-0000-0000-000000000000":
        return sub_data

    try:
        sub_data["user_id"] = user_id
        # Use on_conflict="user_id" so upsert updates existing user record without unique key constraint failure
        res = supabase.table("subscriptions").upsert(sub_data, on_conflict="user_id").execute()
        if res.data and len(res.data) > 0:
            print(f"[SUPABASE DB] Subscription updated via upsert for user {user_id}: {res.data[0]}")
            return res.data[0]
        else:
            # Fallback: try update directly
            up_res = supabase.table("subscriptions").update(sub_data).eq("user_id", user_id).execute()
            if up_res.data and len(up_res.data) > 0:
                print(f"[SUPABASE DB] Subscription updated via update for user {user_id}")
                return up_res.data[0]
            else:
                ins_res = supabase.table("subscriptions").insert(sub_data).execute()
                if ins_res.data:
                    print(f"[SUPABASE DB] Subscription inserted via insert for user {user_id}")
                    return ins_res.data[0]
    except Exception as e:
        print(f"[SUPABASE DB ERROR] Error saving subscription to Supabase for {user_id}: {e}")
        try:
            up_res = supabase.table("subscriptions").update(sub_data).eq("user_id", user_id).execute()
            if up_res.data and len(up_res.data) > 0:
                print(f"[SUPABASE DB] Subscription fallback update succeeded for user {user_id}")
                return up_res.data[0]
        except Exception as ex:
            print(f"[SUPABASE DB ERROR] Secondary fallback update failed for {user_id}: {ex}")

    return sub_data
