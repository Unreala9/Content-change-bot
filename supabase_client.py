import os
import jwt
from typing import Optional, Dict, Any, List
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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
    If Supabase is not configured, returns local default user context.
    """
    if not IS_SUPABASE_CONFIGURED or not supabase:
        return {"id": "00000000-0000-0000-0000-000000000000", "email": "local@user.com", "is_local": True}

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authentication Token. Please sign in via Supabase Auth.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        # 1. Try decoding with Supabase Auth service
        user_res = supabase.auth.get_user(token)
        if user_res and user_res.user:
            return {
                "id": str(user_res.user.id),
                "email": user_res.user.email,
                "is_local": False
            }
    except Exception as e:
        # 2. Fallback to PyJWT token decoding if secret is available
        if SUPABASE_JWT_SECRET:
            try:
                payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
                user_id = payload.get("sub")
                email = payload.get("email", "")
                if user_id:
                    return {"id": user_id, "email": email, "is_local": False}
            except Exception as jwt_err:
                print(f"JWT Decode error: {jwt_err}")

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired Supabase authentication token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not authenticate user token with Supabase.",
        headers={"WWW-Authenticate": "Bearer"},
    )


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
        # Check if settings exist
        existing = get_user_settings_from_db(user_id)
        existing.update(settings_update)
        existing["user_id"] = user_id

        res = supabase.table("user_settings").upsert(existing).execute()
        if res.data:
            return res.data[0]
    except Exception as e:
        print(f"Error saving user_settings to Supabase for {user_id}: {e}")

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
