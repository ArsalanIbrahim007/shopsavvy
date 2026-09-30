<#
.SYNOPSIS
  Registers (or removes) a Windows Task Scheduler task that runs the daily price scrape.

.DESCRIPTION
  The backend has its own 10-11 PM scrape window, but it only fires while the backend is running,
  and a laptop that is asleep or off at 10 PM skips that day. A Task Scheduler task does not have
  that problem:
    - it runs "node src/scripts/run-scheduled-scrape.js" daily at the chosen time,
    - -StartWhenAvailable: if the computer was off at that time, it runs as soon as it is back,
    - -WakeToRun: wakes the computer from sleep to run it,
    - it runs on battery, and only one copy at a time.
  The script shares today's "already ran" record with the backend's own job, so a day is scraped
  once even if both are active. It runs only while you are logged in (no password is stored).
  Output is appended to backend\nightly-scrape.log (gitignored).

  Run it yourself, from any folder, in PowerShell:
    .\register-nightly-scrape.ps1                 register, daily at 22:00
    .\register-nightly-scrape.ps1 -Time 23:30     a different time
    .\register-nightly-scrape.ps1 -DryRun         show what would be registered, change nothing
    .\register-nightly-scrape.ps1 -Status         show the task and when it last ran
    .\register-nightly-scrape.ps1 -Remove         delete the task
#>
param(
  [string]$Time = "22:00",
  [switch]$DryRun,
  [switch]$Status,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$taskName = "ShopSavvy nightly scrape"
$backend = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

if ($Status) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) { Write-Host "No task named '$taskName' is registered."; return }
  $info = Get-ScheduledTaskInfo -TaskName $taskName
  Write-Host "Task:        $taskName ($($task.State))"
  Write-Host "Last run:    $($info.LastRunTime)  (result $($info.LastTaskResult); 0 means success)"
  Write-Host "Next run:    $($info.NextRunTime)"
  Write-Host "Log file:    $backend\nightly-scrape.log"
  return
}

if ($Remove) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed '$taskName'."
  } else {
    Write-Host "No task named '$taskName' is registered."
  }
  return
}

if ($Time -notmatch '^([01]?\d|2[0-3]):[0-5]\d$') { throw "-Time must look like 22:00 (24-hour clock), not '$Time'." }

$node = (Get-Command node -ErrorAction Stop).Source
# cmd.exe so the output can be appended to a log file; Task Scheduler does not keep it otherwise.
$arguments = "/c `"`"$node`" src\scripts\run-scheduled-scrape.js >> nightly-scrape.log 2>&1`""

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $arguments -WorkingDirectory $backend
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Write-Host "Task:          $taskName"
Write-Host "Runs:          daily at $Time (this computer's clock), or when the computer is next available"
Write-Host "Command:       cmd.exe $arguments"
Write-Host "Working folder: $backend"

if ($DryRun) { Write-Host "`nDry run: nothing was registered."; return }

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Re-scrapes every compared product once a day so ShopSavvy builds real price history. See backend\src\scripts\ops\register-nightly-scrape.ps1." -Force | Out-Null
Write-Host "`nRegistered. Check it any time with: .\register-nightly-scrape.ps1 -Status"
