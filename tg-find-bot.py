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
PROXY = ('127.0.0.1', 8443, 'edb5df56a21363fcba9b005f0abc006f')

async def main():
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH,
        connection=ConnectionTcpMTProxyRandomizedIntermediate, proxy=PROXY, connection_retries=3)
    await client.connect()
    # Ищем диалог с gta5rp_helperbot
    async for dialog in client.iter_dialogs(limit=100):
        name = (dialog.name or '').lower()
        ent = dialog.entity
        uname = getattr(ent, 'username', None) or ''
        if 'helper' in uname.lower() or 'gta5rp' in uname.lower() or 'помощник' in name:
            print(f'FOUND: name={dialog.name} username={uname} id={dialog.id}', flush=True)
            # Последние сообщения
            async for msg in client.iter_messages(dialog.id, limit=3):
                if msg.text:
                    print('--- MSG ---', flush=True)
                    print(msg.text[:400], flush=True)
    await client.disconnect()

asyncio.run(main())

