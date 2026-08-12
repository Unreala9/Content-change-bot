import asyncio
import os
import sys
from collections import deque
from datetime import datetime
from typing import Dict, Any, Optional, List, Set
import requests
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    AuthKeyDuplicatedError,
    AuthKeyUnregisteredError,
    UserDeactivatedError,
    UnauthorizedError,
    FloodWaitError
)

from config import API_ID, API_HASH, SESSION_NAME, load_settings
from supabase_client import (
    IS_SUPABASE_CONFIGURED,
    get_user_settings_from_db,
    save_sync_log_to_db,
    get_user_profile_from_db,
    update_user_profile_in_db,
    get_all_users_with_telegram_sessions
)

# App Environment Suffix for local vs production session isolation
APP_ENV = os.getenv("APP_ENV", "dev")
SESSIONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sessions")
os.makedirs(SESSIONS_DIR, exist_ok=True)


def build_telegram_client(session_target) -> TelegramClient:
    """
    Constructs a highly resilient TelegramClient configured with:
    - Infinite reconnection attempts on network jitter / drops (connection_retries=None)
    - Short retry delay (2 seconds)
    - Socket level timeout (20s)
    - RPC request retries (5)
    """
    return TelegramClient(
        session_target,
        API_ID,
        API_HASH,
        connection_retries=None,
        retry_delay=2,
        auto_reconnect=True,
        timeout=20,
        request_retries=5
    )

import json

# In-memory per-user recent message history (max 100 per user)
user_recent_messages: Dict[str, deque] = {}
user_stats: Dict[str, Dict[str, int]] = {}
user_settings_cache: Dict[str, dict] = {}

MSG_MAP_FILE = os.path.join(SESSIONS_DIR, f"msg_map_{APP_ENV}.json")


def _load_persisted_msg_map() -> Dict[str, Dict[str, int]]:
    if os.path.exists(MSG_MAP_FILE):
        try:
            with open(MSG_MAP_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


# Mapping of Source Channel Message ID -> Destination Channel Message ID per user
user_msg_map: Dict[str, Dict[str, int]] = _load_persisted_msg_map()


def record_msg_mapping(user_id: str, source_msg_id: int, dest_msg_id: int):
    if user_id not in user_msg_map:
        user_msg_map[user_id] = {}
    m = user_msg_map[user_id]
    m[str(source_msg_id)] = int(dest_msg_id)
    if len(m) > 2000:
        first_key = next(iter(m))
        del m[first_key]
    try:
        with open(MSG_MAP_FILE, "w", encoding="utf-8") as f:
            json.dump(user_msg_map, f)
    except Exception:
        pass


def get_dest_msg_id(user_id: str, source_msg_id: int) -> Optional[int]:
    return user_msg_map.get(user_id, {}).get(str(source_msg_id))


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
    if IS_SUPABASE_CONFIGURED:
        save_sync_log_to_db(user_id, log_item)


class MultiUserTelegramManager:
    """
    Central Singleton Telegram Client Manager.
    Guarantees exactly ONE live Telethon client per authenticated user per backend process.
    Uses per-user asyncio.Lock to prevent concurrent client initializations.
    """

    def __init__(self):
        self.active_clients: Dict[str, TelegramClient] = {}
        self.attached_listeners: Set[str] = set()
        self.pending_logins: Dict[str, Dict[str, Any]] = {}
        self.local_fallback_client: Optional[TelegramClient] = None
        self._locks: Dict[str, asyncio.Lock] = {}

    def _get_user_lock(self, user_id: str) -> asyncio.Lock:
        if user_id not in self._locks:
            self._locks[user_id] = asyncio.Lock()
        return self._locks[user_id]

    def _get_session_path(self, user_id: str) -> str:
        safe_user = user_id.replace("-", "_")
        return os.path.join(SESSIONS_DIR, f"{safe_user}_{APP_ENV}.session")

    def get_existing_client(self, user_id: str) -> Optional[TelegramClient]:
        """
        Returns an active, connected TelegramClient if one exists in memory.
        Does NOT initiate new connections or create new clients.
        """
        client = self.active_clients.get(user_id)
        if client and client.is_connected():
            print(f"[TELEGRAM_CLIENT_REUSE] Reusing active client for User: {user_id[:8]}")
            return client
        return None

    async def get_client(self, user_id: str) -> Optional[TelegramClient]:
        """
        Retrieves existing active client or initializes one if valid session exists.
        Thread-safe via per-user asyncio.Lock.
        """
        existing = self.get_existing_client(user_id)
        if existing:
            return existing

        async with self._get_user_lock(user_id):
            # Double check inside lock
            existing = self.get_existing_client(user_id)
            if existing:
                return existing

            if not IS_SUPABASE_CONFIGURED:
                if not self.local_fallback_client or not self.local_fallback_client.is_connected():
                    session_file = os.path.join(SESSIONS_DIR, f"fallback_{APP_ENV}")
                    print(f"[TELEGRAM_CLIENT_CREATE] Creating local fallback client: {session_file}")
                    self.local_fallback_client = build_telegram_client(session_file)
                    try:
                        await self.local_fallback_client.connect()
                    except Exception as e:
                        print(f"⚠️ [TELEGRAM_CLIENT_CREATE] Local fallback connection notice: {e}")
                return self.local_fallback_client

            profile = get_user_profile_from_db(user_id)
            session_str = profile.get("telegram_session_string")
            if session_str:
                return await self.start_user_session(user_id, session_str, profile.get("email", user_id))

            print(f"[TELEGRAM_LOGIN_REQUIRED] No active Telegram session for User: {user_id[:8]}")
            return None

    get_client_for_user = get_client

    async def start(self):
        print("🚀 Starting Central Singleton Telegram Client Manager...")
        if IS_SUPABASE_CONFIGURED:
            await self.initialize_all_active_sessions()
        else:
            print("💡 Supabase not configured. Operating in Single-User Local Session Mode.")
            session_file = os.path.join(SESSIONS_DIR, f"fallback_{APP_ENV}")
            self.local_fallback_client = build_telegram_client(session_file)
            try:
                await self.local_fallback_client.connect()
                self._attach_listener("00000000-0000-0000-0000-000000000000", self.local_fallback_client)
                print("✅ Local Telegram Client connected successfully!")
            except Exception as e:
                print(f"⚠️ Local Telegram client start notice: {e}")

    async def initialize_all_active_sessions(self):
        if not IS_SUPABASE_CONFIGURED:
            return

        print("⚡ Initializing active sessions from Supabase...")
        users = get_all_users_with_telegram_sessions()
        print(f"🔍 Found {len(users)} active Telegram session record(s) in Supabase.")

        for u in users:
            uid = u["id"]
            s_str = u.get("telegram_session_string")
            if s_str:
                try:
                    await self.start_user_session(uid, s_str, u.get("email", uid))
                except Exception as e:
                    print(f"⚠️ Could not start Telegram session for User ({u.get('email', uid)}): {e}")

    async def disconnect_all(self):
        print("🔌 Disconnecting all active Telegram Clients...")
        for user_id, client in list(self.active_clients.items()):
            try:
                if client.is_connected():
                    await client.disconnect()
                print(f"[TELEGRAM_CLIENT_DISCONNECT] Disconnected client for User: {user_id[:8]}")
            except Exception as e:
                print(f"Error disconnecting client for {user_id}: {e}")

        self.active_clients.clear()
        self.attached_listeners.clear()

        # Clean pending login clients
        for user_id, pending in list(self.pending_logins.items()):
            p_client = pending.get("client")
            if p_client:
                try:
                    if p_client.is_connected():
                        await p_client.disconnect()
                except Exception:
                    pass
        self.pending_logins.clear()

        if self.local_fallback_client:
            try:
                if self.local_fallback_client.is_connected():
                    await self.local_fallback_client.disconnect()
            except Exception:
                pass
            self.local_fallback_client = None

        print("✅ All Telegram Clients disconnected safely.")

    async def invalidate_session(self, user_id: str, reason: str = "") -> dict:
        """
        Safely invalidates session, disconnects client, removes registry entry, and updates DB.
        """
        print(f"[TELEGRAM_SESSION_INVALID] Invalidating session for User: {user_id[:8]} | Reason: {reason}")

        await self.disconnect_client(user_id)

        if IS_SUPABASE_CONFIGURED:
            update_user_profile_in_db(user_id, {
                "telegram_session_string": None,
                "telegram_phone": None,
                "telegram_first_name": None,
                "telegram_username": None
            })

        # Remove local session file if exists
        sess_path = self._get_session_path(user_id)
        for ext in ["", "-journal"]:
            fpath = sess_path + ext
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception as err:
                    print(f"Notice removing session file {fpath}: {err}")

        return {
            "success": True,
            "connected": False,
            "authorized": False,
            "requires_login": True,
            "message": "Telegram account disconnected successfully!",
            "reason": "telegram_session_invalid"
        }

    async def disconnect_client(self, user_id: str) -> bool:
        if user_id in self.active_clients:
            client = self.active_clients[user_id]
            try:
                if client.is_connected():
                    await client.disconnect()
                print(f"[TELEGRAM_CLIENT_DISCONNECT] Client disconnected for User: {user_id[:8]}")
            except Exception as e:
                print(f"Notice disconnecting client for {user_id}: {e}")
            del self.active_clients[user_id]

        if user_id in self.attached_listeners:
            self.attached_listeners.remove(user_id)

        return True

    async def start_user_session(self, user_id: str, session_str: str, identifier: str = "") -> Optional[TelegramClient]:
        if user_id in self.active_clients and self.active_clients[user_id].is_connected():
            print(f"[TELEGRAM_CLIENT_REUSE] Active client found for User: {identifier or user_id[:8]}")
            return self.active_clients[user_id]

        async with self._get_user_lock(user_id):
            if user_id in self.active_clients and self.active_clients[user_id].is_connected():
                return self.active_clients[user_id]

            print(f"[TELEGRAM_CLIENT_CREATE] Creating new StringSession client for User: {identifier or user_id[:8]}")

            try:
                client = build_telegram_client(StringSession(session_str))
                await client.connect()

                if not await client.is_user_authorized():
                    print(f"⚠️ [TELEGRAM_SESSION_INVALID] StringSession for user {identifier or user_id[:8]} is not authorized.")
                    await client.disconnect()
                    await self.invalidate_session(user_id, reason="Not authorized")
                    return None

                # Warm up internal Telethon entity cache safely
                try:
                    await client.get_dialogs(limit=50)
                except Exception as cache_err:
                    print(f"⚠️ Notice warming dialogs cache for {identifier or user_id[:8]}: {cache_err}")

                self._attach_listener(user_id, client)
                self.active_clients[user_id] = client
                print(f"✅ [TELEGRAM_CLIENT_CREATE] Client ready for User: {identifier or user_id[:8]}")
                return client

            except (AuthKeyDuplicatedError, AuthKeyUnregisteredError, UserDeactivatedError, UnauthorizedError) as auth_err:
                print(f"🚨 [TELEGRAM_SESSION_INVALID] Session invalidated for user {identifier or user_id[:8]}: ({type(auth_err).__name__}) {auth_err}")
                await self.invalidate_session(user_id, reason=str(auth_err))
                return None
            except Exception as e:
                print(f"⚠️ Error starting Telegram session for user {identifier or user_id[:8]}: {e}")
                return None

    def _attach_listener(self, user_id: str, client: TelegramClient):
        if user_id in self.attached_listeners:
            print(f"ℹ️ Listener already attached for User: {user_id[:8]}")
            return

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

                # Extract reply information if this message is replying to another message
                is_reply = bool(event.is_reply)
                reply_to_msg_id = getattr(event, "reply_to_msg_id", None)
                reply_text = ""
                reply_sender = ""

                if is_reply:
                    try:
                        reply_msg = await event.get_reply_message()
                        if reply_msg:
                            reply_text = reply_msg.raw_text or reply_msg.message or ""
                            if reply_msg.sender:
                                reply_sender = getattr(reply_msg.sender, "first_name", "") or getattr(reply_msg.sender, "title", "") or getattr(reply_msg.sender, "username", "") or str(reply_msg.sender_id)
                            elif reply_msg.sender_id:
                                reply_sender = str(reply_msg.sender_id)
                    except Exception as reply_err:
                        print(f"⚠️ Notice resolving reply context for msg {event.id}: {reply_err}")

                # Filter by Source Channel
                configured_source = str(settings.get("source_channel_id", "all")).strip()
                if configured_source and configured_source != "all":
                    clean_event_chat = str(event.chat_id).replace("-100", "").replace("-", "")
                    clean_sender_id = str(event.sender_id).replace("-100", "").replace("-", "") if event.sender_id else ""
                    clean_config_source = configured_source.replace("-100", "").replace("-", "")

                    chat_title = (getattr(event.chat, "title", None) or getattr(event.chat, "first_name", None) or "").strip().lower()
                    chat_username = (getattr(event.chat, "username", None) or "").strip().lower()
                    conf_lower = configured_source.lower()

                    matches_id = (clean_event_chat == clean_config_source) or (clean_sender_id and clean_sender_id == clean_config_source)
                    matches_title = bool(chat_title and (conf_lower in chat_title or chat_title in conf_lower))
                    matches_user = bool(chat_username and (conf_lower.replace("@", "") in chat_username))

                    if not (matches_id or matches_title or matches_user):
                        return

                from main import apply_text_transformation, resolve_telegram_entity
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
                    "telegram_posted": False,
                    "is_reply": is_reply,
                    "reply_to_msg_id": reply_to_msg_id,
                    "reply_text": reply_text,
                    "reply_sender": reply_sender
                }

                if not should_forward:
                    stats["filtered"] += 1
                    log_item["status"] = "skipped"
                    add_user_message_log(user_id, log_item)
                    print(f"⏩ [Filtered User:{user_id[:8]}] Chat: {chat_name} | Reason: {reason}")
                    return

                # Auto-Posting to Destination Channel
                auto_post_telegram = settings.get("auto_post_telegram", True)
                dest_channel_id = str(settings.get("destination_channel_id", "")).strip()

                if auto_post_telegram and dest_channel_id:
                    clean_dest = dest_channel_id.replace("-100", "").replace("-", "")
                    clean_event_chat = str(event.chat_id).replace("-100", "").replace("-", "")

                    if clean_event_chat == clean_dest:
                        print(f"⏩ [Skip Relay] Source chat is destination channel itself ({dest_channel_id})")
                    else:
                        try:
                            dest_entity = await resolve_telegram_entity(client, dest_channel_id)
                            if not dest_entity:
                                raise Exception(f"Could not resolve entity for destination channel {dest_channel_id}")

                            override_image = settings.get("override_media_image", False)
                            custom_image_url = settings.get("custom_image_url", "").strip()
                            strip_media = settings.get("strip_media_images", False)

                            # Resolve native destination reply ID if replying to a known forwarded message
                            dest_reply_to_id = None
                            if is_reply and reply_to_msg_id:
                                dest_reply_to_id = get_dest_msg_id(user_id, reply_to_msg_id)
                                # Auto-match fallback: if parent was posted before bot restart, match by content in destination
                                if not dest_reply_to_id and reply_text:
                                    try:
                                        clean_reply = reply_text.strip()[:50].lower()
                                        dest_history = await client.get_messages(dest_entity, limit=50)
                                        for dm in dest_history:
                                            dm_text = (dm.raw_text or dm.message or "").strip().lower()
                                            if dm_text and (clean_reply in dm_text or dm_text in clean_reply or (len(clean_reply) > 10 and clean_reply[:20] in dm_text)):
                                                dest_reply_to_id = dm.id
                                                record_msg_mapping(user_id, reply_to_msg_id, dm.id)
                                                print(f"🎯 [AUTO-MATCH] Linked reply to existing destination message: ID {dm.id}")
                                                break
                                    except Exception as match_err:
                                        print(f"⚠️ Notice matching parent in destination history: {match_err}")

                            # Always send clean transformed text (never pollute message body with text quotes)
                            message_to_send = transformed_text

                            # Safe send with FloodWait protection & native Telegram reply linking
                            sent_msg = None
                            for send_attempt in range(3):
                                try:
                                    if strip_media:
                                        sent_msg = await client.send_message(entity=dest_entity, message=message_to_send, reply_to=dest_reply_to_id)
                                    elif override_image and custom_image_url:
                                        sent_msg = await client.send_file(entity=dest_entity, file=custom_image_url, caption=message_to_send, reply_to=dest_reply_to_id)
                                    elif event.media:
                                        sent_msg = await client.send_file(entity=dest_entity, file=event.media, caption=message_to_send, reply_to=dest_reply_to_id)
                                    else:
                                        sent_msg = await client.send_message(entity=dest_entity, message=message_to_send, reply_to=dest_reply_to_id)
                                    break
                                except FloodWaitError as fwe:
                                    wait_secs = fwe.seconds + 1
                                    print(f"⏳ [FloodWait User:{user_id[:8]}] Rate limited. Sleeping {wait_secs}s before retry...")
                                    await asyncio.sleep(wait_secs)
                                    if send_attempt == 2:
                                        raise
                                except Exception as send_err:
                                    # Fallback if reply_to ID was rejected by Telegram
                                    if dest_reply_to_id is not None:
                                        print(f"⚠️ Notice native reply_to failed ({send_err}), retrying without reply_to...")
                                        dest_reply_to_id = None
                                        continue
                                    raise

                            if sent_msg and hasattr(sent_msg, "id"):
                                record_msg_mapping(user_id, event.id, sent_msg.id)

                            log_item["telegram_posted"] = True
                            stats["forwarded"] += 1
                            print(f"⚡ [INSTANT RELAY User:{user_id[:8]}] Posted to Telegram destination ({dest_channel_id}) (reply_to={dest_reply_to_id})")
                        except Exception as tg_err:
                            print(f"⚠️ [User:{user_id[:8]}] Telegram auto-post error: {tg_err}")
                            log_item["telegram_error"] = str(tg_err)

                add_user_message_log(user_id, log_item)

                # n8n Webhook Forwarding
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
                        "is_reply": is_reply,
                        "reply_to_msg_id": reply_to_msg_id,
                        "reply_text": reply_text,
                        "reply_sender": reply_sender
                    }
                    loop = asyncio.get_event_loop()

                    def post_webhook():
                        return requests.post(webhook_url, json=payload, timeout=10)

                    response = await loop.run_in_executor(None, post_webhook)
                    log_item["status"] = f"sent (HTTP {response.status_code})"
                    print(f"✅ [User:{user_id[:8]}] Sent to n8n ({chat_name}) | Status: {response.status_code}")

            except Exception as e:
                stats["errors"] += 1
                print(f"❌ [User:{user_id[:8]}] Error in listener: {e}")

        self.attached_listeners.add(user_id)
        print(f"✅ [LISTENER_ATTACH] Listener registered for User: {user_id[:8]}")

    async def connection_watchdog(self):
        """
        Active background health-check loop that runs every 30 seconds.
        Ensures all active sessions remain connected across network glitches and re-attaches listeners.
        """
        print("🛡️ [WATCHDOG] Telegram Connection Watchdog started.")
        while True:
            try:
                await asyncio.sleep(30)
                if not IS_SUPABASE_CONFIGURED:
                    if self.local_fallback_client:
                        if not self.local_fallback_client.is_connected():
                            print("🔄 [WATCHDOG] Reconnecting local fallback client...")
                            try:
                                await self.local_fallback_client.connect()
                                print("✅ [WATCHDOG] Local fallback client reconnected!")
                            except Exception as e:
                                print(f"⚠️ [WATCHDOG] Failed to reconnect local fallback: {e}")
                    continue

                users = get_all_users_with_telegram_sessions()
                for u in users:
                    uid = u["id"]
                    s_str = u.get("telegram_session_string")
                    if not s_str:
                        continue

                    client = self.active_clients.get(uid)
                    if not client or not client.is_connected():
                        print(f"🔄 [WATCHDOG] Reconnecting dropped client for User: {u.get('email', uid[:8])}...")
                        try:
                            if uid in self.attached_listeners:
                                self.attached_listeners.remove(uid)
                            await self.start_user_session(uid, s_str, u.get("email", uid))
                        except Exception as reconn_err:
                            print(f"⚠️ [WATCHDOG] Reconnect error for {u.get('email', uid[:8])}: {reconn_err}")
                    elif uid not in self.attached_listeners:
                        print(f"🔄 [WATCHDOG] Re-attaching missing listener for User: {u.get('email', uid[:8])}...")
                        self._attach_listener(uid, client)

            except asyncio.CancelledError:
                print("🛑 [WATCHDOG] Connection Watchdog stopped.")
                break
            except Exception as loop_err:
                print(f"⚠️ [WATCHDOG] Watchdog cycle error: {loop_err}")

    async def send_auth_code(self, user_id: str, phone_number: str) -> dict:
        # Clean up any existing pending login client for this user first
        if user_id in self.pending_logins:
            old_pending = self.pending_logins.pop(user_id)
            old_client = old_pending.get("client")
            if old_client and old_client.is_connected():
                try:
                    await old_client.disconnect()
                except Exception:
                    pass

        client = build_telegram_client(StringSession())
        await client.connect()

        try:
            res = await client.send_code_request(phone_number)
            self.pending_logins[user_id] = {
                "client": client,
                "phone": phone_number,
                "phone_code_hash": res.phone_code_hash
            }
            print(f"[TELEGRAM_CLIENT_CREATE] Created pending auth code client for User: {user_id[:8]}")
            return {"success": True, "message": "Verification code sent to your Telegram app!"}
        except Exception as e:
            if client.is_connected():
                await client.disconnect()
            raise Exception(str(e))

    async def verify_auth_code(self, user_id: str, phone_number: str, code: str, password: Optional[str] = None) -> dict:
        pending = self.pending_logins.get(user_id)
        if not pending or pending.get("phone") != phone_number:
            client = await self.get_client(user_id)
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

            print(f"✅ [TELEGRAM_CLIENT_CREATE] Auth successful for User: {user_id[:8]} ({me.first_name})")
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
        except (AuthKeyDuplicatedError, AuthKeyUnregisteredError, UserDeactivatedError) as auth_err:
            await self.invalidate_session(user_id, reason=str(auth_err))
            raise Exception("Telegram session invalidated during login. Please try again.")
        except Exception as e:
            raise Exception(str(e))

    async def logout_user(self, user_id: str) -> dict:
        return await self.invalidate_session(user_id, reason="User requested logout")

    logout_user_telegram = logout_user
    update_settings_cache = staticmethod(update_settings_cache)


# Global Singleton Manager Instance
telegram_manager = MultiUserTelegramManager()
TelegramClientManager = MultiUserTelegramManager
