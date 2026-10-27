@echo off
cd /d "%~dp0"
"..\tools\node-v24.22.1-win-x64\node.exe" scripts/local-openrouter/local.mjs build
pause
