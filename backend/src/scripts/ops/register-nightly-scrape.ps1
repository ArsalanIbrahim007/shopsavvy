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
    - it runs on battery, and only one copy at a time,
    - it runs HIDDEN: through "conhost --headless" there is no black console window to close. (The first
      version opened a visible cmd window; closing it killed the scrape with result 0xC000013A, and no
      scrape completed for five days.)
  The script shares today's "already ran" record with the backend's own job, so a day is scraped
  once even if both are active. It runs only while you are logged in (no password is stored).
  Output is appended to backend\nightly-scrape.log (gitignored), each run starting with a timestamped line.

  Run it yourself, from any folder, in PowerShell:
    .\register-nightly-scrape.ps1                 register (or re-register) daily at 22:00
    .\register-nightly-scrape.ps1 -Time 23:30     a different time
    .\register-nightly-scrape.ps1 -DryRun         show what would be registered, change nothing
    .\register-nightly-scrape.ps1 -Status         show the task, what its last result means, and the last scrape that completed
    .\register-nightly-scrape.ps1 -RunNow         start the task now (takes about 25 minutes; hidden; follow it with -Status)
    .\register-nightly-scrape.ps1 -Remove         delete the task
#>
param(
  [string]$Time = "22:00",
  [switch]$DryRun,
  [switch]$Status,
  [switch]$RunNow,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$taskName = "ShopSavvy nightly scrape"
$backend = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

# What Task Scheduler's last result means, in words.
function Get-ResultMeaning([int64]$code) {
  switch ($code) {
    0           { return "succeeded" }
    1           { return "the scrape failed: read the end of nightly-scrape.log" }
    267009      { return "is running now" }
    267011      { return "has not run yet" }
    267014      { return "was stopped by Task Scheduler (it ran longer than 3 hours)" }
    3221225786  { return "was stopped: its window was closed, or Ctrl+C was pressed" }
    default     { return "unrecognised code (0x{0:X})" -f $code }
  }
}

if ($Status) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) { Write-Host "No task named '$taskName' is registered."; return }
  $info = Get-ScheduledTaskInfo -TaskName $taskName
  Write-Host "Task:        $taskName ($($task.State))"
  Write-Host "Last run:    $($info.LastRunTime)"
  Write-Host "Last result: $($info.LastTaskResult), $(Get-ResultMeaning $info.LastTaskResult)"
  Write-Host "Next run:    $($info.NextRunTime)"
  Write-Host "Command:     $($task.Actions[0].Execute) $($task.Actions[0].Arguments)"

  # The date of the last scrape that COMPLETED is what matters: a task that "ran" may have been stopped half way.
  $stateFile = Join-Path $backend ".scheduled-scrape-state.json"
  if (Test-Path $stateFile) {
    $last = (Get-Content $stateFile -Raw | ConvertFrom-Json).lastRunDate
    if ($last) {
      $days = [int]((Get-Date).Date - [datetime]::Parse($last).Date).TotalDays
      $note = if ($days -le 1) { "" } else { "   <-- $days days ago: the nightly scrape is not completing" }
      Write-Host "Last scrape that completed: $last$note"
    } else {
      Write-Host "Last scrape that completed: none recorded"
    }
  }

  $log = Join-Path $backend "nightly-scrape.log"
  Write-Host "Log file:    $log"
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 0) {
    Write-Host "End of the log:"
    Get-Content $log -Tail 5 | ForEach-Object { Write-Host "  $_" }
  }
  return
}

if ($RunNow) {
  if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) { throw "No task named '$taskName' is registered. Register it first." }
  Start-ScheduledTask -TaskName $taskName
  Write-Host "Started. It runs hidden and takes about 25 minutes. Check progress with: .\register-nightly-scrape.ps1 -Status"
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
$conhost = Join-Path $env:SystemRoot "System32\conhost.exe"
if (-not (Test-Path $conhost)) { throw "conhost.exe was not found at $conhost; this script needs Windows 10 (1809) or newer." }

# cmd.exe so the output can be appended to a log file (Task Scheduler does not keep it otherwise), started through
# "conhost --headless" so that no console window appears for anyone to close.
$arguments = "--headless cmd.exe /c `"`"$node`" src\scripts\run-scheduled-scrape.js >> nightly-scrape.log 2>&1`""

$action = New-ScheduledTaskAction -Execute $conhost -Argument $arguments -WorkingDirectory $backend
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Write-Host "Task:          $taskName"
Write-Host "Runs:          daily at $Time (this computer's clock), or when the computer is next available, with no window"
Write-Host "Command:       $conhost $arguments"
Write-Host "Working folder: $backend"

if ($DryRun) { Write-Host "`nDry run: nothing was registered."; return }

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Re-scrapes every compared product once a day so ShopSavvy builds real price history. See backend\src\scripts\ops\register-nightly-scrape.ps1." -Force | Out-Null
Write-Host "`nRegistered. Test it now with: .\register-nightly-scrape.ps1 -RunNow   and check with: .\register-nightly-scrape.ps1 -Status"
