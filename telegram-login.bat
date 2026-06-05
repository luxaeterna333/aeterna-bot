@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Запуск авторизации Telegram...
echo.
"C:\Program Files\nodejs\node.exe" telegram-login.mjs
echo.
pause
