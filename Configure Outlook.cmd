@echo off
cd /d "%~dp0"
echo See OUTLOOK-SETUP.md for Microsoft app registration and the credentials JSON format.
set /p "outlook_json=Path to Microsoft credentials JSON: "
"..\tools\node-v24.22.1-win-x64\node.exe" scripts/local-openrouter/configure-outlook.mjs "%outlook_json%"
pause
