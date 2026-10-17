@echo off
rem Double-click to run today's price scrape now (see run-scrape-now.ps1 next to this file).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-scrape-now.ps1" %*
