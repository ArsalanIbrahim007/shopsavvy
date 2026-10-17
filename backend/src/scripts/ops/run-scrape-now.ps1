<#
.SYNOPSIS
  Runs the daily price scrape now, in a window you can watch: double-click "Run ShopSavvy Scrape.cmd" (next to this file, or
  its shortcut on the desktop).

.DESCRIPTION
  The same scrape the 22:00 Task Scheduler task runs (src\scripts\run-scheduled-scrape.js), for a day the computer was off or
  asleep at 22:00. It shares the task's "already done today" record, so a day is never scraped twice and it never runs at the
  same time as the task:
    - today already scraped: it says so and asks whether to run again anyway;
    - the task is running right now: it says so and stops.
  While it runs it keeps Windows awake (a request for this program only, released when it ends; no setting is changed), shows the
  progress, and appends everything to backend\nightly-scrape.log like the task does. It takes up to about 2 h 50 min (150 minutes
  of searches, then the product-page check). Closing the window stops it; the next run carries on where the queries left off.

  ASCII only (Windows PowerShell 5.1 reads scripts in the system code page).
#>
param([switch]$Plan)

$ErrorActionPreference = "Stop"
$backend = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$log = if ($env:SHOPSAVVY_SCRAPE_LOG) { $env:SHOPSAVVY_SCRAPE_LOG } else { Join-Path $backend "nightly-scrape.log" } # the variable is for tests
$entry = "src\scripts\run-scheduled-scrape.js"
$script:lastLine = ""
Set-Location $backend
$Host.UI.RawUI.WindowTitle = "ShopSavvy price scrape - keep this window open"

function Say([string]$text, [string]$colour = "Gray") { Write-Host $text -ForegroundColor $colour }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Say "Node.js was not found. Install it from https://nodejs.org (LTS), then run this again." Red
  Read-Host "Press Enter to close"; exit 1
}

# Keep the computer awake while this window runs (ES_CONTINUOUS | ES_SYSTEM_REQUIRED); cleared below, and by Windows when it exits.
Add-Type -Namespace ShopSavvy -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
function Stay-Awake([bool]$on) { [void][ShopSavvy.Power]::SetThreadExecutionState($(if ($on) { [uint32]2147483649 } else { [uint32]2147483648 })) }

# Runs node, shows each line and appends it to the log (UTF-8 without a byte-order mark, the log's own encoding). Returns the exit code.
function Run-Scrape([string[]]$extra) {
  $writer = New-Object System.IO.StreamWriter($log, $true, (New-Object System.Text.UTF8Encoding($false)))
  $writer.AutoFlush = $true
  try {
    $arguments = @($entry) + $extra
    & cmd.exe /c "node $($arguments -join ' ') 2>&1" | ForEach-Object {
      $line = [string]$_
      $writer.WriteLine($line)
      if ($line -match '^\(\d+/\d+\)' ) { Write-Host "`r$line".PadRight(110) -NoNewline } # progress overwrites itself
      elseif ($line -match 'starting|queries to re-scrape|time budget|^Done\.|Page check|failed|stopped by|already run|already running|finished') { Write-Host ""; Write-Host $line -ForegroundColor Cyan }
      $script:lastLine = $line
    }
    return $LASTEXITCODE
  } finally {
    $writer.Dispose()
  }
}

Say ""
Say "ShopSavvy price scrape" White
Say "Backend folder: $backend"
if ($Plan) {
  Say "Showing what tonight's run would search (nothing is scraped)..." Yellow
  & cmd.exe /c "node $entry --plan 2>&1"
  Read-Host "`nPress Enter to close"; exit 0
}
Say "Takes up to about 2 h 50 min. Keep this window open; the computer will not go to sleep while it runs." Yellow
Say ""

Stay-Awake $true
try {
  $started = Get-Date
  $code = Run-Scrape @()
  Write-Host ""

  $scraped = $true
  if ($script:lastLine -match "already running") {
    Say "The scheduled task is scraping right now, so this window has nothing to do." Yellow
    $scraped = $false
  } elseif ($script:lastLine -match "already run") {
    $answer = Read-Host "Today's scrape has already run. Run it again anyway? (y/N)"
    if ($answer -match '^(y|yes)$') { $code = Run-Scrape @("--force"); Write-Host "" }
    else { Say "Nothing was scraped: today is already done." Green; $scraped = $false }
  }

  $minutes = [int]((Get-Date) - $started).TotalMinutes
  if (-not $scraped) { }
  elseif ($code -eq 0) { Say "Finished in $minutes min. Details are in $log" Green }
  else { Say "The scrape stopped with an error (code $code) after $minutes min. The end of $log says why." Red }
} finally {
  Stay-Awake $false
}
Read-Host "`nPress Enter to close"
