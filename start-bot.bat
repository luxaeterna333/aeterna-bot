@echo off
cd /d "C:\Users\lux aeterna\Desktop\Projects\aeterna-bot"
:loop
"C:\Program Files\nodejs\node.exe" index.js
rem если бот упал (сеть не готова на старте и т.п.) — ждём ~15 сек и перезапускаем
ping -n 16 127.0.0.1 >nul
goto loop
