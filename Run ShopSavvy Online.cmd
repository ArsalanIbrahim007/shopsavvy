@echo off
REM Runs the ShopSavvy API on this PC and opens the ngrok tunnel, so the website on Cloudflare Pages can reach it.
REM Setup, once: deploy\README-pc.md. Close both windows (or press Ctrl+C) to take the site offline.
cd /d "%~dp0backend"

if not exist "..\deploy\ngrok-domain.txt" (
  echo Put your ngrok domain ^(for example something.ngrok-free.app^) in deploy\ngrok-domain.txt first. See deploy\README-pc.md.
  pause
  exit /b 1
)
set /p NGROK_DOMAIN=<"..\deploy\ngrok-domain.txt"

where ngrok >nul 2>nul
if errorlevel 1 (
  echo ngrok is not installed or not on the PATH. See deploy\README-pc.md, step 1.
  pause
  exit /b 1
)

echo Starting the API in its own window...
start "ShopSavvy API" cmd /k node src/app.js
timeout /t 10 >nul

echo Opening the tunnel at https://%NGROK_DOMAIN% ...
ngrok http --url=%NGROK_DOMAIN% 5000
