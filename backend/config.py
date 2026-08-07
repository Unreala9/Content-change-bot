import os
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

SETTINGS_FILE = "settings.json"

DEFAULT_SETTINGS = {
    "webhook_url": os.getenv("WEBHOOK_URL", "https://n8n.getaipilot.in/webhook/telegram_sync"),
    "source_channel_id": "all",
    "destination_channel_id": os.getenv("DESTINATION_CHANNEL", ""),
    "auto_post_telegram": True,
    "auto_post_n8n": True,
    "text_prefix": "",
    "text_suffix": "",
    "find_text": "",
    "replace_text": "",
    "replacement_rules": [],
    "override_all_links": False,
    "custom_link_url": "",
    "remove_all_links": False,
    "override_media_image": False,
    "custom_image_url": "",
    "strip_media_images": False,
    "keyword_filter": "",
    "filter_mode": "all",  # "all" or "contains"
    "enabled": True
}


def load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                merged = DEFAULT_SETTINGS.copy()
                merged.update(data)
                return merged
        except Exception as e:
            print(f"Error loading {SETTINGS_FILE}: {e}")
    return DEFAULT_SETTINGS.copy()


def save_settings(new_settings: dict) -> dict:
    current = load_settings()
    current.update(new_settings)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2)
    return current


API_ID = int(os.getenv("TELEGRAM_API_ID", 20504953))
API_HASH = os.getenv("TELEGRAM_API_HASH", "d28ccc2a28a88a172294b723a305f6f8")
SESSION_NAME = os.getenv("SESSION_NAME", "telegram_session")
PORT = int(os.getenv("PORT", 8000))

# Supabase Configurations
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()

IS_SUPABASE_CONFIGURED = bool(SUPABASE_URL and (SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY))

# Razorpay & Edge Function Configurations
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
SUPABASE_EDGE_FUNCTION_URL = os.getenv(
    "SUPABASE_EDGE_FUNCTION_URL",
    f"{SUPABASE_URL}/functions/v1" if SUPABASE_URL else ""
).strip()
