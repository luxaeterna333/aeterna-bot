import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from opentele.td import shared as td
from PyQt5.QtCore import QByteArray, QDataStream

TDATA = r'C:\Users\lux aeterna\Desktop\Projects\aeterna-bot\tdata_copy'

keyData = td.Storage.ReadFile('key_data', TDATA)
print('version:', keyData.version, flush=True)
salt, keyEncrypted, infoEncrypted = QByteArray(), QByteArray(), QByteArray()
keyData.stream >> salt >> keyEncrypted >> infoEncrypted
print('salt size:', salt.size(), 'keyEnc:', keyEncrypted.size(), 'infoEnc:', infoEncrypted.size(), flush=True)

passcodeKey = td.Storage.CreateLocalKey(salt, QByteArray(b''))
keyInnerData = td.Storage.DecryptLocal(keyEncrypted, passcodeKey)
localKey = td.AuthKey(keyInnerData.stream.readRawData(256))
print('localKey OK', flush=True)

info = td.Storage.DecryptLocal(infoEncrypted, localKey)
count = info.stream.readInt32()
print('COUNT:', count, flush=True)
for i in range(count if 0 < count < 10 else 0):
    print('  index', i, '->', info.stream.readInt32(), flush=True)
