from telethon import TelegramClient
from config import API_ID, API_HASH, SESSION_NAME

client = TelegramClient(SESSION_NAME, API_ID, API_HASH)

async def main():
    async for dialog in client.iter_dialogs():
        print("=" * 60)
        print(f"Name : {dialog.name}")
        print(f"ID   : {dialog.id}")
        print(f"Type : {type(dialog.entity).__name__}")

with client:
    client.loop.run_until_complete(main())