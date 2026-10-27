@echo off
cd /d "%~dp0"
echo Download the Web application OAuth client JSON from Google Cloud Console.
set /p "gmail_json=Path to downloaded JSON file: "
"..\tools\node-v24.22.1-win-x64\node.exe" scripts/local-openrouter/configure-gmail.mjs "%gmail_json%"
pause
