import os
import sys
import re
import asyncio
from collections import deque
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Dict, Any, Optional, List

# IST timezone (UTC+5:30)
IST = ZoneInfo("Asia/Kolkata")

def now_ist() -> str:
    """Return current time formatted in IST."""
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")

def to_ist(dt) -> str:
    """Convert a datetime object (UTC-aware or naive) to IST formatted string."""
    if dt is None:
        return now_ist()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S IST")



import requests
from fastapi import HTTPException
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import SessionPasswordNeededError, PhoneCodeInvalidError

from config import API_ID, API_HASH, SESSION_NAME, IS_SUPABASE_CONFIGURED, load_settings, save_settings
from supabase_client import (
    get_user_settings_from_db,
    save_sync_log_to_db,
    get_user_profile_from_db,
    update_user_profile_in_db,
    get_all_users_with_telegram_sessions,
    get_user_sync_logs_from_db
)

# Text transformation engine (stateless helper)
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

    # 1. Multiple Structured Replacement Rules
    rules = settings.get("replacement_rules", [])
    if isinstance(rules, list):
        for rule in rules:
            if isinstance(rule, dict):
                find_val = rule.get("find", "")
                replace_val = rule.get("replace", "")
                if find_val:
                    pattern = re.compile(re.escape(find_val), re.IGNORECASE)
                    transformed = pattern.sub(replace_val, transformed)

    # 2. Comma-separated find_text & replace_text (Bulk Quick Mode)
    find_text = settings.get("find_text", "")
    replace_text = settings.get("replace_text", "")
    if find_text:
        find_list = [f.strip() for f in find_text.split(",") if f.strip()]
        replace_list = [r.strip() for r in replace_text.split(",")]
        
        for i, f_word in enumerate(find_list):
            if not f_word:
                continue
            
            # Determine replacement word:
            # - If index exists in replace_list, use it
            # - If replace_list has only 1 item, use that item for all find words
            # - Otherwise default to empty string
            if i < len(replace_list):
                r_word = replace_list[i]
            elif len(replace_list) == 1:
                r_word = replace_list[0]
            else:
                r_word = ""

            # Case-insensitive global replacement
            pattern = re.compile(re.escape(f_word), re.IGNORECASE)
            transformed = pattern.sub(r_word, transformed)

    # 3. Smart Link Modifier Engine
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


class UserClientContainer:
    def __init__(self, user_id: str, client: TelegramClient, session_string: str = ""):
        self.user_id = user_id
        self.client = client
        self.session_string = session_string
        self.recent_messages = deque(maxlen=100)
        self.stats = {
            "received": 0,
            "forwarded": 0,
            "filtered": 0,
            "errors": 0
        }


class TelegramManager:
    def __init__(self):
        self.user_containers: Dict[str, UserClientContainer] = {}
        self.pending_auth: Dict[str, Dict[str, Any]] = {}
        # Legacy/Fallback single client
        self.fallback_client: Optional[TelegramClient] = None
        self.fallback_container: Optional[UserClientContainer] = None

    async def init_all_users(self):
        """Start Telegram clients for all connected users in Supabase, or fallback to local session."""
        print("⚡ Initializing Multi-User Telegram Manager...")
        
        if IS_SUPABASE_CONFIGURED:
            users_with_sessions = get_all_users_with_telegram_sessions()
            print(f"🔍 Found {len(users_with_sessions)} active Telegram sessions in Supabase.")
            for user_data in users_with_sessions:
                user_id = str(user_data["id"])
                session_str = user_data.get("telegram_session_string", "")
                if session_str:
                    try:
                        await self.start_user_client(user_id, session_str)
                        print(f"✅ Active Telegram client started for User: {user_data.get('email', user_id)}")
                    except Exception as e:
                        print(f"⚠️ Could not start Telegram client for user {user_id}: {e}")
        
        # Fallback local client if no users connected or local mode
        if not self.user_containers:
            print("🔌 Connecting Fallback Local Session Client...")
            try:
                self.fallback_client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
                await self.fallback_client.connect()
                self.fallback_container = UserClientContainer("00000000-0000-0000-0000-000000000000", self.fallback_client)
                self.user_containers["00000000-0000-0000-0000-000000000000"] = self.fallback_container
                if await self.fallback_client.is_user_authorized():
                    self.register_message_listener("00000000-0000-0000-0000-000000000000", self.fallback_client)
                    print("✅ Fallback Local Telegram Client Connected & Listening!")
                else:
                    print("ℹ️ Fallback Local Telegram Client connected (not authorized - user can log in via Web UI).")
            except Exception as e:
                print(f"⚠️ Fallback Telegram client notice: {e}")

    async def start_user_client(self, user_id: str, session_string: str) -> TelegramClient:
        session = StringSession(session_string)
        client = TelegramClient(session, API_ID, API_HASH)
        await client.connect()
        
        container = UserClientContainer(user_id, client, session_string)
        self.user_containers[user_id] = container
        self.register_message_listener(user_id, client)
        return client

    def register_message_listener(self, user_id: str, client: TelegramClient):
        @client.on(events.NewMessage)
        async def incoming_message_handler(event):
            await self._process_incoming_message(user_id, client, event)

    async def _process_incoming_message(self, user_id: str, client: TelegramClient, event):
        container = self.user_containers.get(user_id)
        if not container:
            return

        container.stats["received"] += 1
        settings = get_user_settings_from_db(user_id)

        if not settings.get("enabled", True):
            return

        try:
            chat = await event.get_chat()
            chat_name = getattr(chat, "title", None) or getattr(chat, "first_name", "Unknown")
            raw_text = event.raw_text or ""

            # Filter by Source Channel
            configured_source = str(settings.get("source_channel_id", "all")).strip()
            if configured_source and configured_source != "all" and str(event.chat_id) != configured_source:
                return

            # Transform message
            transformed_text, should_forward, reason = apply_text_transformation(raw_text, settings)

            log_item = {
                "id": event.id,
                "chat_id": event.chat_id,
                "chat_name": chat_name,
                "raw_message": raw_text,
                "transformed_message": transformed_text,
                "date": to_ist(event.date),
                "sender_id": event.sender_id,
                "status": "pending",
                "reason": reason,
                "webhook_url": settings.get("webhook_url", ""),
                "telegram_posted": False
            }

            if not should_forward:
                container.stats["filtered"] += 1
                log_item["status"] = "skipped"
                container.recent_messages.appendleft(log_item)
                save_sync_log_to_db(user_id, log_item)
                print(f"⏩ [Filtered User {user_id[:6]}] Chat: {chat_name} | Reason: {reason}")
                return

            # 1. Direct Telegram Auto-Posting
            auto_post_telegram = settings.get("auto_post_telegram", False)
            dest_channel_id = str(settings.get("destination_channel_id", "")).strip()

            if auto_post_telegram and dest_channel_id:
                try:
                    target_dest = int(dest_channel_id) if (dest_channel_id.isdigit() or dest_channel_id.startswith("-")) else dest_channel_id
                    dest_entity = await client.get_entity(target_dest)
                    await client.send_message(entity=dest_entity, message=transformed_text)
                    log_item["telegram_posted"] = True
                    print(f"✈️ Auto-posted directly to Telegram channel ({dest_channel_id}) for User {user_id[:6]}!")
                except Exception as tg_err:
                    print(f"⚠️ Telegram auto-post error for User {user_id[:6]}: {tg_err}")
                    log_item["telegram_error"] = str(tg_err)

            # 2. n8n Webhook Forwarding
            auto_post_n8n = settings.get("auto_post_n8n", True)
            webhook_url = settings.get("webhook_url", "")

            if auto_post_n8n and webhook_url:
                payload = {
                    "chat_id": event.chat_id,
                    "chat_name": chat_name,
                    "message_id": event.id,
                    "message": transformed_text,
                    "raw_message": raw_text,
                    "date": str(event.date),
                    "sender_id": event.sender_id,
                    "user_id": user_id
                }
                loop = asyncio.get_event_loop()

                def post_webhook():
                    return requests.post(webhook_url, json=payload, timeout=10)

                response = await loop.run_in_executor(None, post_webhook)
                log_item["status"] = f"sent (HTTP {response.status_code})"
                log_item["status_code"] = response.status_code
                print(f"✅ Webhook sent for User {user_id[:6]} ({chat_name}) | Status: {response.status_code}")
            else:
                log_item["status"] = "synced to Telegram"

            container.stats["forwarded"] += 1

        except Exception as e:
            container.stats["errors"] += 1
            print(f"❌ Listener error for User {user_id[:6]}: {e}")
            log_item["status"] = f"error: {str(e)}"

        container.recent_messages.appendleft(log_item)
        save_sync_log_to_db(user_id, log_item)

    def get_user_container(self, user_id: str) -> Optional[UserClientContainer]:
        if user_id in self.user_containers:
            return self.user_containers[user_id]
        # Return fallback container if available
        return self.user_containers.get("00000000-0000-0000-0000-000000000000")

    def get_client(self, user_id: str) -> Optional[TelegramClient]:
        container = self.get_user_container(user_id)
        return container.client if container else None

    async def send_auth_code(self, user_id: str, phone_number: str) -> dict:
        session = StringSession()
        client = TelegramClient(session, API_ID, API_HASH)
        await client.connect()

        res = await client.send_code_request(phone_number)
        
        self.pending_auth[user_id] = {
            "phone_number": phone_number,
            "phone_code_hash": res.phone_code_hash,
            "session": session,
            "client": client
        }
        return {"success": True, "message": f"Verification code sent to {phone_number}!"}

    async def verify_auth_code(self, user_id: str, phone_number: str, code: str, password: Optional[str] = None) -> dict:
        auth_data = self.pending_auth.get(user_id)
        if not auth_data or auth_data.get("phone_number") != phone_number:
            raise HTTPException(status_code=400, detail="No active login request found for this phone number. Please click 'Send Code' again.")

        client: TelegramClient = auth_data["client"]
        session: StringSession = auth_data["session"]
        phone_code_hash = auth_data["phone_code_hash"]

        try:
            # Step 1: Always sign in with phone code first
            try:
                await client.sign_in(phone=phone_number, code=code, phone_code_hash=phone_code_hash)
            except SessionPasswordNeededError:
                # Step 2: If 2FA is required, sign in with password
                if not password:
                    raise HTTPException(status_code=401, detail="2FA_PASSWORD_REQUIRED")
                await client.sign_in(password=password)

            me = await client.get_me()
            session_string = session.save()

            # Save to Supabase profile
            update_user_profile_in_db(user_id, {
                "telegram_session_string": session_string,
                "telegram_phone": phone_number,
                "telegram_user_id": me.id,
                "telegram_first_name": me.first_name or "",
                "telegram_username": me.username or ""
            })

            # Store active client container
            container = UserClientContainer(user_id, client, session_string)
            self.user_containers[user_id] = container
            self.register_message_listener(user_id, client)

            # Clear pending auth
            del self.pending_auth[user_id]

            return {
                "success": True,
                "user": {
                    "id": me.id,
                    "first_name": me.first_name,
                    "username": me.username or "",
                    "phone": phone_number
                }
            }

        except PhoneCodeInvalidError:
            raise HTTPException(status_code=400, detail="Invalid verification code. Please check and try again.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    async def disconnect_user(self, user_id: str) -> dict:
        container = self.user_containers.get(user_id)
        if container and container.client:
            try:
                if container.client.is_connected():
                    await container.client.disconnect()
            except Exception as e:
                print(f"Error disconnecting client for user {user_id}: {e}")
            del self.user_containers[user_id]

        update_user_profile_in_db(user_id, {
            "telegram_session_string": None,
            "telegram_phone": None,
            "telegram_user_id": None,
            "telegram_first_name": None,
            "telegram_username": None
        })

        return {"success": True, "message": "Telegram account disconnected successfully."}

    async def shutdown(self):
        print("🔌 Shutting down Multi-User Telegram Clients...")
        for user_id, container in list(self.user_containers.items()):
            try:
                if container.client and container.client.is_connected():
                    await container.client.disconnect()
            except Exception as e:
                print(f"Error disconnecting user {user_id}: {e}")
        self.user_containers.clear()


# Global Telegram Manager Instance
telegram_manager = TelegramManager()
