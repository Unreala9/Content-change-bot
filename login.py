import sys
from telethon import TelegramClient
from config import API_ID, API_HASH, SESSION_NAME

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

client = TelegramClient(SESSION_NAME, API_ID, API_HASH)

async def main():
    me = await client.get_me()
    print(f"✅ Logged in as: {me.first_name}")
    if me.username:
        print(f"Username: @{me.username}")
    print(f"Phone: {me.phone}")

with client:
    client.loop.run_until_complete(main())