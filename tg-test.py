import os
import sys, io, asyncio, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.network.connection import ConnectionTcpMTProxyRandomizedIntermediate
import urllib.request, json

SESSION = open("telethon_session.txt", encoding="utf-8").read().strip()
API_ID = int(os.environ.get("TG_API_ID", "0"))
API_HASH = os.environ.get("TG_API_HASH", "")
PROXY = ("127.0.0.1", 8443, os.environ.get("TG_PROXY_SECRET",""))

async def main():
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH,
        connection=ConnectionTcpMTProxyRandomizedIntermediate, proxy=PROXY)
    await client.connect()
    me = await client.get_me()
    print("Connected as:", me.first_name, flush=True)
    async for msg in client.iter_messages("gta5rp_helperbot", limit=50):
        text = msg.text or ""
        if "aeterna" in text.lower():
            print("Found:", text[:200], flush=True)
            env = {}
            with open(".env", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        env[k.strip()] = v.strip()
            channel_id = env.get("VZP_CHANNEL_ID", "")
            token = env.get("TOKEN", "")
            payload = json.dumps({"content": f"**[???? TG]** ????????? ????????? ? `.aeterna`:\n```\n{text[:500]}\n```"}).encode()
            req = urllib.request.Request(
                f"https://discord.com/api/v10/channels/{channel_id}/messages",
                data=payload,
                headers={"Authorization": f"Bot {token}", "Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req) as resp:
                print("Discord response:", resp.status, flush=True)
            break
    else:
        print("No messages with .aeterna found", flush=True)
    await client.disconnect()

asyncio.run(main())

