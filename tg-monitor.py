import os
import sys, io, asyncio, re, json, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.network import ConnectionTcpMTProxyRandomizedIntermediate

API_ID = int(os.environ.get("TG_API_ID", "0"))
API_HASH = os.environ.get("TG_API_HASH", "")
with open('telethon_session.txt', encoding='utf-8') as f:
    SESSION = f.read().strip()
PROXY = ('127.0.0.1', 8443, os.environ.get("TG_PROXY_SECRET",""))

BOT_ID = 7621046969  # gta5rp_helperbot
NODE_URL = 'http://127.0.0.1:3001/tg-war'

def send_to_node(payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(NODE_URL, data=data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=5)
        print('-> sent to Node:', payload['side'], payload['opponent'], flush=True)
    except Exception as e:
        print('Node send error:', e, flush=True)

def parse_war(text):
    # Пример: "Ваша организация забила REINHARD войну за Ломбард Strawberry на 21:48, 8х8, ..."
    if 'забил' not in text.lower():
        return None
    m_org = re.search(r'Организация:.*?\|\s*(.+?),\s*сервер\s+(\S+)', text)
    m_war = re.search(r'забил[аи]?\s+(.+?)\s+войну за\s+(.+?)\s+на\s+(\d{1,2}:\d{2})', text)
    if not m_war:
        return None
    opponent = m_war.group(1).strip()
    point = m_war.group(2).strip()
    time = m_war.group(3).strip()
    server = m_org.group(2).strip() if m_org else '—'
    m_fmt = re.search(r'(\d+х\d+|\d+x\d+)', text)
    fmt = m_fmt.group(1) if m_fmt else '—'
    return {
        'side': 'АТАКА',  # "забили войну" = мы атакуем
        'opponent': opponent,
        'point': point,
        'server': server,
        'time': time,
        'format': fmt,
    }

async def main():
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH,
        connection=ConnectionTcpMTProxyRandomizedIntermediate, proxy=PROXY,
        connection_retries=999, auto_reconnect=True, retry_delay=5)
    await client.connect()
    me = await client.get_me()
    print(f'TG-монитор запущен как {me.first_name} (id={me.id})', flush=True)
    print(f'Слушаю @gta5rp_helperbot (id={BOT_ID})...', flush=True)

    @client.on(events.NewMessage(from_users=BOT_ID))
    async def handler(event):
        text = event.message.text or ''
        print('[TG msg]', text[:80], flush=True)
        war = parse_war(text)
        if war:
            send_to_node(war)
        else:
            print('  (не ВЗП-уведомление, пропуск)', flush=True)

    await client.run_until_disconnected()

asyncio.run(main())

