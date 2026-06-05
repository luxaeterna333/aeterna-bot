Set WshShell = CreateObject("WScript.Shell")
' Ждём 60 сек после загрузки ПК — чтобы сеть и uv-python успели подняться
WScript.Sleep 60000
WshShell.Run "cmd /c ""C:\Users\lux aeterna\Desktop\Projects\aeterna-bot\start-bot.bat""", 0, False
WshShell.Run "cmd /c ""C:\Users\lux aeterna\Desktop\Projects\aeterna-bot\start-tg-monitor.bat""", 0, False
