import os
import sys, io, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.network import ConnectionTcpMTProxyRandomizedIntermediate

API_ID = int(os.environ.get("TG_API_ID", "0"))
API_HASH = os.environ.get("TG_API_HASH", "")

with open('telethon_session.txt', encoding='utf-8') as f:
    SESSION = f.read().strip()

# MTProxy: (host, port, secret)
PROXY = ('127.0.0.1', 8443, os.environ.get("TG_PROXY_SECRET",""))

async def main():
    client = TelegramClient(
        StringSession(SESSION), API_ID, API_HASH,
        connection=ConnectionTcpMTProxyRandomizedIntermediate,
        proxy=PROXY,
        connection_retries=3,
    )
    await client.connect()
    if await client.is_user_authorized():
        me = await client.get_me()
        print('OK logged in:', me.first_name, 'id=' + str(me.id), flush=True)
    else:
        print('NOT authorized', flush=True)
    await client.disconnect()

asyncio.run(main())

