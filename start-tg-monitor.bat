@echo off
chcp 65001 >nul
cd /d "%~dp0"
:loop
rem python.exe (а не pythonw) в цикле — если uv-питон не готов на старте, повторяем
".\tgvenv8\Scripts\python.exe" telegram-monitor.py
ping -n 21 127.0.0.1 >nul
goto loop
