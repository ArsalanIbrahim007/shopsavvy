<#
.SYNOPSIS
  One-off check: can the headless browser be started from inside a Task Scheduler task, the way the nightly scrape runs?

.DESCRIPTION
  The nightly scrape on 2026-10-08 could not start the browser (Paklap and iShopping failed on every query: "Executable doesn't
  exist", although the file is there and starts fine from a normal terminal). This registers a throw-away task that runs
  check-browser.js with the same account, settings and command shape as the nightly task, starts it, prints what it saw, and
  removes the task again. It scrapes nothing and changes nothing else.

  Run it yourself, in PowerShell:
    .\check-task-browser.ps1
#>
$ErrorActionPreference = "Stop"
$taskName = "ShopSavvy browser check"
$backend = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$log = Join-Path $backend "browser-check.log"
Remove-Item $log -ErrorAction SilentlyContinue

$conhost = Join-Path $env:SystemRoot "System32\conhost.exe"
$action = New-ScheduledTaskAction -Execute $conhost -Argument "--headless cmd.exe /c node src\scripts\ops\check-browser.js >> browser-check.log 2>&1" -WorkingDirectory $backend
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddHours(1)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Host "Started the check inside Task Scheduler; waiting for it (up to 90 seconds)..."
  $deadline = (Get-Date).AddSeconds(90)
  do { Start-Sleep -Seconds 2 } while ((Get-ScheduledTask -TaskName $taskName).State -eq "Running" -and (Get-Date) -lt $deadline)
  Start-Sleep -Seconds 1
  if (Test-Path $log) { Write-Host "`n--- what the task saw:"; Get-Content $log | ForEach-Object { Write-Host "  $_" } }
  else { Write-Host "`nThe task left no output at all: it did not start node." }
} finally {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item $log -ErrorAction SilentlyContinue
  Write-Host "`nRemoved the temporary task."
}
