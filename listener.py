import sys
import requests
from telethon import TelegramClient, events
from config import API_ID, API_HASH, SESSION_NAME, WEBHOOK_URL

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

client = TelegramClient(SESSION_NAME, API_ID, API_HASH)


@client.on(events.NewMessage)
async def handler(event):
    try:
        chat = await event.get_chat()
        chat_name = getattr(chat, "title", None) or getattr(chat, "first_name", "Unknown")

        payload = {
            "chat_id": event.chat_id,
            "chat_name": chat_name,
            "message_id": event.id,
            "message": event.raw_text,
            "date": str(event.date),
            "sender_id": event.sender_id,
        }

        # Print to terminal
        print("\n" + "=" * 60)
        print(f"Chat Name : {chat_name}")
        print(f"Chat ID   : {event.chat_id}")
        print(f"Message ID: {event.id}")
        print(f"Message   : {event.raw_text}")
        print(f"Date      : {event.date}")
        print("=" * 60)

        # Send to n8n
        response = requests.post(WEBHOOK_URL, json=payload)

        print(f"✅ Sent to n8n | Status Code: {response.status_code}")

    except Exception as e:
        print(f"❌ Error: {e}")


print("🚀 Listening for Telegram messages...")
client.start()
client.run_until_disconnected()