import os
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

SETTINGS_FILE = "settings.json"

DEFAULT_SETTINGS = {
    "webhook_url": os.getenv("WEBHOOK_URL", "https://n8n.getaipilot.in/webhook/telegram_sync"),
    "source_channel_id": os.getenv("SOURCE_CHANNEL_ID", "all"),
    "destination_channel_id": os.getenv("DESTINATION_CHANNEL_ID", ""),
    "auto_post_telegram": False,
    "text_prefix": "",
    "text_suffix": "",
    "find_text": "",
    "replace_text": "",
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