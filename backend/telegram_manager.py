import asyncio
import os
import sys
from collections import deque
from datetime import datetime
from typing import Dict, Any, Optional, List
import requests
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import SessionPasswordNeededError, PhoneCodeInvalidError, AuthKeyDuplicatedError, AuthKeyUnregisteredError

from config import API_ID, API_HASH, SESSION_NAME, load_settings
from supabase_client import (
    IS_SUPABASE_CONFIGURED,
    get_user_settings_from_db,
    save_sync_log_to_db,
    get_user_profile_from_db,
    update_user_profile_in_db,
    get_all_users_with_telegram_sessions
)

# In-memory per-user recent message history (max 100 per user)
user_recent_messages: Dict[str, deque] = {}
user_stats: Dict[str, Dict[str, int]] = {}
user_settings_cache: Dict[str, dict] = {}


def get_cached_settings(user_id: str) -> dict:
    if user_id in user_settings_cache:
        return user_settings_cache[user_id]
    settings = get_user_settings_from_db(user_id) if IS_SUPABASE_CONFIGURED else load_settings()
    user_settings_cache[user_id] = settings
    return settings


def update_settings_cache(user_id: str, new_settings: dict):
    if user_id not in user_settings_cache:
        user_settings_cache[user_id] = {}
    user_settings_cache[user_id].update(new_settings)


def get_user_stats(user_id: str) -> Dict[str, int]:
    if user_id not in user_stats:
        user_stats[user_id] = {"received": 0, "forwarded": 0, "filtered": 0, "errors": 0}
    return user_stats[user_id]


def get_user_messages(user_id: str) -> List[dict]:
    if user_id not in user_recent_messages:
        user_recent_messages[user_id] = deque(maxlen=100)
    return list(user_recent_messages[user_id])


def add_user_message_log(user_id: str, log_item: dict):
    if user_id not in user_recent_messages:
        user_recent_messages[user_id] = deque(maxlen=100)
    user_recent_messages[user_id].appendleft(log_item)
    # Save to Supabase DB if enabled
    save_sync_log_to_db(user_id, log_item)


class MultiUserTelegramManager:
    """
    Manages active Telethon StringSession clients concurrently for multiple platform users.
    """

    def __init__(self):
        self.active_clients: Dict[str, TelegramClient] = {}
        self.pending_logins: Dict[str, Dict[str, Any]] = {}
        self.local_fallback_client: Optional[TelegramClient] = None

    async def start(self):
        print("🚀 Starting Telegram Sync Hub...")
        if IS_SUPABASE_CONFIGURED:
            await self.initialize_all_active_sessions()
        else:
            print("💡 Supabase not configured. Operating in Single-User Local Session Mode.")
            self.local_fallback_client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
            try:
                await self.local_fallback_client.start()
                self._attach_listener("00000000-0000-0000-0000-000000000000", self.local_fallback_client)
                print("✅ Local Telegram Client started successfully!")
            except Exception as e:
                print(f"⚠️ Local Telegram client start notice: {e}")

    async def initialize_all_active_sessions(self):
        if not IS_SUPABASE_CONFIGURED:
            print("ℹ️ Local Mode: Initializing single fallback Telegram Client...")
            self.local_fallback_client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
            try:
                await self.local_fallback_client.connect()
                print("⚡ Local Telegram Client connected.")
            except Exception as e:
                print(f"⚠️ Local Telegram client start notice: {e}")
            return

        print("⚡ Initializing Multi-User Telegram Manager...")
        users = get_all_users_with_telegram_sessions()
        print(f"🔍 Found {len(users)} active Telegram sessions in Supabase.")

        for u in users:
            uid = u["id"]
            s_str = u.get("telegram_session_string")
            if s_str:
                try:
                    await self.start_user_session(uid, s_str, u.get("email", uid))
                except Exception as e:
                    print(f"⚠️ Could not start Telegram session for User ({u.get('email', uid)}): {e}")

    async def stop(self):
        print("🔌 Stopping all active Telegram Client sessions...")
        for user_id, client in list(self.active_clients.items()):
            try:
                if client.is_connected():
                    await client.disconnect()
            except Exception as e:
                print(f"Error disconnecting client for {user_id}: {e}")
        self.active_clients.clear()

        if self.local_fallback_client and self.local_fallback_client.is_connected():
            await self.local_fallback_client.disconnect()
        print("✅ All Telegram Clients disconnected.")

    async def start_user_session(self, user_id: str, session_str: str, identifier: str = ""):
        if user_id in self.active_clients and self.active_clients[user_id].is_connected():
            return self.active_clients[user_id]

        try:
            client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
            await client.connect()

            if not await client.is_user_authorized():
                print(f"⚠️ StringSession for user {identifier or user_id} is no longer authorized.")
                await client.disconnect()
                if IS_SUPABASE_CONFIGURED:
                    update_user_profile_in_db(user_id, {"telegram_session_string": ""})
                return None

            # Warm up internal Telethon entity cache for instant 0ms channel resolution
            try:
                await client.get_dialogs(limit=100)
                print(f"⚡ Entity cache warmed up for User: {identifier or user_id}")
            except Exception as cache_err:
                print(f"⚠️ Notice warming dialogs cache: {cache_err}")

            self._attach_listener(user_id, client)
            self.active_clients[user_id] = client
            print(f"✅ Active Telegram client started for User: {identifier or user_id}")
            return client
        except (AuthKeyDuplicatedError, AuthKeyUnregisteredError) as e:
            print(f"⚠️ Telegram Session revoked/invalidated for user {identifier or user_id}: {e}")
            if IS_SUPABASE_CONFIGURED:
                update_user_profile_in_db(user_id, {"telegram_session_string": ""})
            return None
        except Exception as e:
            print(f"⚠️ Error starting Telegram session for user {identifier or user_id}: {e}")
            return None

    def _attach_listener(self, user_id: str, client: TelegramClient):
        @client.on(events.NewMessage)
        async def user_message_handler(event):
            stats = get_user_stats(user_id)
            stats["received"] += 1

            settings = get_cached_settings(user_id)

            if not settings.get("enabled", True):
                return

            try:
                chat_name = getattr(event.chat, "title", None) or getattr(event.chat, "first_name", "Chat")
                raw_text = event.raw_text or ""

                # Filter by Source Channel
                configured_source = str(settings.get("source_channel_id", "all")).strip()
                if configured_source and configured_source != "all":
                    clean_event_chat = str(event.chat_id).replace("-100", "").replace("-", "")
                    clean_config_source = configured_source.replace("-100", "").replace("-", "")
                    if clean_event_chat != clean_config_source:
                        return

                # Import dynamic text transform function
                from main import apply_text_transformation
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
                    "telegram_posted": False
                }

                if not should_forward:
                    stats["filtered"] += 1
                    log_item["status"] = "skipped"
                    asyncio.create_task(asyncio.to_thread(add_user_message_log, user_id, log_item))
                    print(f"⏩ [Filtered User:{user_id[:8]}] Chat: {chat_name} | Reason: {reason}")
                    return

                # 1. Direct Telegram Auto-Posting to Destination Channel (INSTANT HIGH PRIORITY)
                auto_post_telegram = settings.get("auto_post_telegram", False)
                dest_channel_id = str(settings.get("destination_channel_id", "")).strip()

                if auto_post_telegram and dest_channel_id:
                    try:
                        target_dest = int(dest_channel_id) if (dest_channel_id.isdigit() or dest_channel_id.startswith("-")) else dest_channel_id
                        try:
                            dest_entity = await client.get_entity(target_dest)
                        except Exception:
                            dialogs = await client.get_dialogs(limit=200)
                            clean_target = str(dest_channel_id).replace("-100", "").replace("-", "")
                            dest_entity = None
                            for d in dialogs:
                                if str(d.id).replace("-100", "").replace("-", "") == clean_target:
                                    dest_entity = d.entity
                                    break
                            if not dest_entity:
                                raise

                        override_image = settings.get("override_media_image", False)
                        custom_image_url = settings.get("custom_image_url", "").strip()
                        strip_media = settings.get("strip_media_images", False)

                        if override_image and custom_image_url:
                            await client.send_file(entity=dest_entity, file=custom_image_url, caption=transformed_text)
                        elif event.media and not strip_media:
                            await client.send_file(entity=dest_entity, file=event.media, caption=transformed_text)
                        else:
                            await client.send_message(entity=dest_entity, message=transformed_text)

                        log_item["telegram_posted"] = True
                        print(f"⚡ [INSTANT RELAY User:{user_id[:8]}] Posted to Telegram destination ({dest_channel_id})")
                    except Exception as tg_err:
                        print(f"⚠️ [User:{user_id[:8]}] Telegram auto-post error: {tg_err}")
                        log_item["telegram_error"] = str(tg_err)

                # Save log asynchronously without blocking the main event loop
                asyncio.create_task(asyncio.to_thread(add_user_message_log, user_id, log_item))

                # 2. n8n Webhook Forwarding
                auto_post_n8n = settings.get("auto_post_n8n", True)
                webhook_url = settings.get("webhook_url", "")

                if auto_post_n8n and webhook_url:
                    payload = {
                        "user_id": user_id,
                        "chat_id": event.chat_id,
                        "chat_name": chat_name,
                        "message_id": event.id,
                        "message": transformed_text,
                        "raw_message": raw_text,
                        "date": str(event.date),
                        "sender_id": event.sender_id,
                    }
                    loop = asyncio.get_event_loop()

                    def post_webhook():
                        return requests.post(webhook_url, json=payload, timeout=10)

                    response = await loop.run_in_executor(None, post_webhook)
                    log_item["status"] = f"sent (HTTP {response.status_code})"
                    log_item["status_code"] = response.status_code
                    print(f"✅ [User:{user_id[:8]}] Sent to n8n ({chat_name}) | Status: {response.status_code}")
                else:
                    log_item["status"] = "synced to Telegram"

                stats["forwarded"] += 1

            except Exception as e:
                stats["errors"] += 1
                print(f"❌ [User:{user_id[:8]}] Error in listener: {e}")
                log_item["status"] = f"error: {str(e)}"
                add_user_message_log(user_id, log_item)
            else:
                add_user_message_log(user_id, log_item)

    async def get_client_for_user(self, user_id: str) -> Optional[TelegramClient]:
        if user_id in self.active_clients:
            client = self.active_clients[user_id]
            if not client.is_connected():
                await client.connect()
            return client

        if not IS_SUPABASE_CONFIGURED:
            if not self.local_fallback_client:
                self.local_fallback_client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
            if not self.local_fallback_client.is_connected():
                await self.local_fallback_client.connect()
            return self.local_fallback_client

        # Try loading session string from Supabase
        profile = get_user_profile_from_db(user_id)
        session_str = profile.get("telegram_session_string")
        if session_str:
            client = await self.start_user_session(user_id, session_str, profile.get("email", user_id))
            return client

        return None

    async def send_auth_code(self, user_id: str, phone_number: str) -> dict:
        client = TelegramClient(StringSession(), API_ID, API_HASH)
        await client.connect()

        try:
            res = await client.send_code_request(phone_number)
            self.pending_logins[user_id] = {
                "client": client,
                "phone": phone_number,
                "phone_code_hash": res.phone_code_hash
            }
            return {"success": True, "message": "Verification code sent to your Telegram app!"}
        except Exception as e:
            if client.is_connected():
                await client.disconnect()
            raise Exception(str(e))

    async def verify_auth_code(self, user_id: str, phone_number: str, code: str, password: Optional[str] = None) -> dict:
        pending = self.pending_logins.get(user_id)
        if not pending or pending.get("phone") != phone_number:
            # Fallback if no pending login in memory (e.g. single user local fallback)
            client = await self.get_client_for_user(user_id)
            if not client:
                raise Exception("No active Telegram connection request found. Please resend phone code.")
        else:
            client = pending["client"]

        try:
            phone_code_hash = pending.get("phone_code_hash") if pending else None
            try:
                await client.sign_in(
                    phone=phone_number,
                    code=code,
                    phone_code_hash=phone_code_hash
                )
            except SessionPasswordNeededError:
                if not password:
                    raise SessionPasswordNeededError("2FA Password required")
                await client.sign_in(password=password)

            me = await client.get_me()
            session_string = client.session.save()

            if IS_SUPABASE_CONFIGURED:
                update_user_profile_in_db(user_id, {
                    "telegram_session_string": session_string,
                    "telegram_phone": phone_number,
                    "telegram_first_name": me.first_name,
                    "telegram_username": me.username or ""
                })

            self._attach_listener(user_id, client)
            self.active_clients[user_id] = client
            if user_id in self.pending_logins:
                del self.pending_logins[user_id]

            return {
                "success": True,
                "user": {
                    "id": me.id,
                    "first_name": me.first_name,
                    "username": me.username or "",
                    "phone": me.phone or phone_number
                }
            }

        except SessionPasswordNeededError:
            raise Exception("2FA Password required")
        except PhoneCodeInvalidError:
            raise Exception("Invalid verification code entered.")
        except Exception as e:
            raise Exception(str(e))

    async def logout_user_telegram(self, user_id: str) -> dict:
        if user_id in self.active_clients:
            client = self.active_clients[user_id]
            try:
                if client.is_connected():
                    await client.log_out()
                    await client.disconnect()
            except Exception as e:
                print(f"Notice disconnecting client for user {user_id}: {e}")
            del self.active_clients[user_id]

        if not IS_SUPABASE_CONFIGURED and self.local_fallback_client:
            try:
                if self.local_fallback_client.is_connected():
                    await self.local_fallback_client.log_out()
                    await self.local_fallback_client.disconnect()
            except Exception as e:
                print(f"Notice disconnecting local client: {e}")
            self.local_fallback_client = None

        if IS_SUPABASE_CONFIGURED:
            update_user_profile_in_db(user_id, {
                "telegram_session_string": None,
                "telegram_phone": None,
                "telegram_first_name": None,
                "telegram_username": None
            })

        return {"success": True, "message": "Telegram account disconnected successfully!"}


# Global Singleton Manager Instance
telegram_manager = MultiUserTelegramManager()
