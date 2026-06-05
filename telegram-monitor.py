import os
import sys, io, asyncio, json, os, re
from http.client import HTTPConnection

# Под pythonw.exe (запуск без консоли) sys.stdout/stderr == None.
# Обращение к .buffer крашит скрипт сразу же, поэтому пишем в лог-файл.
if sys.stdout is None or sys.stderr is None:
    _log = open(os.path.join(os.path.dirname(__file__), 'tg-monitor.log'), 'a', encoding='utf-8')
    sys.stdout = _log
    sys.stderr = _log
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.network.connection import ConnectionTcpMTProxyRandomizedIntermediate

SESSION_FILE = os.path.join(os.path.dirname(__file__), 'telethon_session.txt')
SESSION = open(SESSION_FILE, encoding='utf-8').read().strip()
API_ID = int(os.environ.get("TG_API_ID", "0"))
API_HASH = os.environ.get("TG_API_HASH", "")
PROXY = ('127.0.0.1', 8443, os.environ.get("TG_PROXY_SECRET",""))
NODE_PORT = 3001

def send_to_node(data):
    try:
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        conn = HTTPConnection('127.0.0.1', NODE_PORT, timeout=5)
        conn.request('POST', '/tg-event', payload, {'Content-Type': 'application/json'})
        resp = conn.getresponse()
        print(f'Sent to node: {resp.status}', flush=True)
        conn.close()
    except Exception as e:
        print(f'Node send error: {e}', flush=True)

def parse_war_message(text):
    # "Организация: события | Lux_Aeterna, сервер Rockford"
    # АТАКА:  "Ваша организация забила REINHARD войну за Ломбард Strawberry на 21:48, 8х8"
    # ДЕФ:    "Wright забили Вашей организации войну за Ломбард Strawberry на 22:43, 8х8"
    org_match = re.search(r'Организация:.*?\|\s*\**(.+?)\**,\s*сервер\s+(\S+)', text, re.I)
    if not org_match:
        return None

    # Сначала проверяем деф (на нас напали)
    war_match = re.search(r'([^\n]+?)\s+забил[аи]?\s+Ваш\w*\s+организаци\w*\s+войну за\s+(.+?)\s+на\s+(\d{1,2}:\d{2})', text, re.I)
    side = 'ДЕФ'
    if not war_match:
        # Иначе атака (мы напали)
        war_match = re.search(r'Ваш\w*\s+организаци\w*\s+забил[аи]?\s+(.+?)\s+войну за\s+(.+?)\s+на\s+(\d{1,2}:\d{2})', text, re.I)
        side = 'АТАКА'
    if not war_match:
        return None

    return {
        'type': 'war',
        'family': org_match.group(1).strip(),
        'server': org_match.group(2).strip(),
        'opponent': war_match.group(1).strip(' *'),
        'point': war_match.group(2).strip(),
        'time': war_match.group(3).strip(),
        'side': side,
        'format': (re.search(r'(\d+[хx]\d+)', text) or type('', (), {'group': lambda s, n: '—'})()).group(1),
        'text': text,
    }

async def main():
    client = TelegramClient(
        StringSession(SESSION), API_ID, API_HASH,
        connection=ConnectionTcpMTProxyRandomizedIntermediate,
        proxy=PROXY
    )
    await client.connect()
    me = await client.get_me()
    print(f'TG connected as: {me.first_name}', flush=True)

    @client.on(events.NewMessage(from_users='gta5rp_helperbot'))
    async def handler(event):
        text = event.message.text or ''
        print(f'[TG] New message: {text[:80]}', flush=True)
        if 'Организация:' not in text:
            return
        parsed = parse_war_message(text)
        if parsed:
            send_to_node(parsed)
            print(f'[TG] Sent war event: {parsed["opponent"]} at {parsed["point"]}', flush=True)

    print('TG monitor started, waiting for messages...', flush=True)
    await client.run_until_disconnected()

if __name__ == '__main__':
    asyncio.run(main())

