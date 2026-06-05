import sys, io, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from opentele.td import shared as td
from opentele.td import TDesktop
from opentele.api import UseCurrentSession, API
from telethon.sessions import StringSession
from PyQt5.QtCore import QByteArray

TDATA = r'C:\Users\lux aeterna\Desktop\Projects\aeterna-bot\tdata_copy'
PROXY = ('mtproxy', '127.0.0.1', 8443, os.environ.get("TG_PROXY_SECRET",""))

async def main():
    tdesk = TDesktop()
    # Прямой доступ к приватным полям через mangled-имена
    tdesk._TDesktop__basePath = TDATA
    tdesk._TDesktop__keyFile = 'data'
    tdesk._TDesktop__passcode = ''
    tdesk._TDesktop__passcodeBytes = b''
    tdesk._TDesktop__api = API.TelegramDesktop.Generate('windows')

    keyData = td.Storage.ReadFile('key_data', TDATA)
    salt, keyEncrypted, infoEncrypted = QByteArray(), QByteArray(), QByteArray()
    keyData.stream >> salt >> keyEncrypted >> infoEncrypted
    tdesk._TDesktop__AppVersion = keyData.version
    passcodeKey = td.Storage.CreateLocalKey(salt, QByteArray(b''))
    keyInnerData = td.Storage.DecryptLocal(keyEncrypted, passcodeKey)
    localKey = td.AuthKey(keyInnerData.stream.readRawData(256))
    tdesk._TDesktop__localKey = localKey

    info = td.Storage.DecryptLocal(infoEncrypted, localKey)
    count = info.stream.readInt32()
    print('Accounts found:', count, flush=True)

    for i in range(count):
        index = info.stream.readInt32()
        if 0 <= index < TDesktop.kMaxAccounts:
            account = td.Account(tdesk, basePath=TDATA, api=tdesk.api, keyFile='data', index=index)
            try:
                cfg = account.prepareToStart(localKey)
                if not account.isLoaded():
                    # Принудительно читаем MTP-данные (содержат authKey)
                    account._local.readMtpData()
                print(f'  index={index}: isLoaded={account.isLoaded()}', flush=True)
            except Exception as e:
                import traceback
                print(f'  index={index} EXC:', flush=True)
                traceback.print_exc()
            if account.isLoaded():
                tdesk.accounts.append(account)
                break  # достаточно первого аккаунта

    print('Total:', len(tdesk.accounts), flush=True)
    if len(tdesk.accounts) == 0:
        return

    # Выставляем флаг загрузки вручную
    tdesk._TDesktop__isLoaded = True
    tdesk._TDesktop__active_index = 0
    tdesk._TDesktop__mainAccount = tdesk.accounts[0]

    acc = tdesk.accounts[0]
    auth_key = acc.authKey.key  # bytes (256)
    dc_id = int(acc.MainDcId)
    print('dc_id:', dc_id, 'authKey len:', len(auth_key), flush=True)

    # IP серверов Telegram по DC (production)
    DC_IP = {1:'149.154.175.53',2:'149.154.167.51',3:'149.154.175.100',4:'149.154.167.91',5:'91.108.56.130'}
    ip = DC_IP.get(dc_id, '149.154.167.51')

    # Собираем telethon StringSession вручную
    sess = StringSession()
    sess.set_dc(dc_id, ip, 443)
    from telethon.crypto import AuthKey
    sess.auth_key = AuthKey(auth_key)
    string = sess.save()
    with open('telethon_session.txt', 'w', encoding='utf-8') as f:
        f.write(string)
    print('SESSION SAVED OK (len=' + str(len(string)) + ')', flush=True)

asyncio.run(main())
