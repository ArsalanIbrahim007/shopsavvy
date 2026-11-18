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

echo Opening every page once in a third window, so the first visitor does not wait (a few minutes; it closes by itself)...
REM Without this, on a fresh cache folder the first home page took up to 79 s and Honest prices 89 s (measured 2026-11-18).
start "ShopSavvy warm-up" cmd /c "node src\scripts\ops\warm-up.js & echo. & echo This window closes in a minute. & timeout /t 60 >nul"

echo Opening the tunnel at https://%NGROK_DOMAIN% ...
ngrok http --url=%NGROK_DOMAIN% 5000
