@echo off
cd /d "%~dp0"
start "" /b powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "Start-Process -FilePath '..\tools\node-v24.22.1-win-x64\node.exe' -ArgumentList 'scripts/local-openrouter/local.mjs','start' -WorkingDirectory '%~dp0.' -WindowStyle Hidden -RedirectStandardOutput '.context\logs\launcher.log' -RedirectStandardError '.context\logs\launcher.err.log'"
echo Inbox Zero is starting at http://localhost:3000/login
