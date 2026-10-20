# IMS disaster-recovery backup to the NAS (\\Sideburnt\NorthField\IMS BACKUP, mapped as Z:).
# Runs nightly from Task Scheduler ("IMS NAS backup"), or by hand: pwsh -File ims-nas-backup.ps1
#
#   project\            the whole IMS folder - code, .env files, data, PDFs, firmware, Home Assistant, node_modules.
#                       Only new or changed files are copied; nothing is ever deleted from the backup, so a file
#                       deleted by mistake on the PC is still here.
#   databases\<date>\   consistent snapshots of app.db and Home Assistant's database (last 30 nights)
#   git\                a git bundle of the full history (last 14 nights) - a complete repo without GitHub
#   claude-project\     Claude's memory notes and conversation history for this project
#   windows-startup\    the shortcuts that start IMS when Windows starts
#   logs\               one log a night (last 30); LAST_BACKUP.txt says how the last run went
#
# The UNC path is used rather than Z: because a scheduled task doesn't see mapped drive letters.

$ErrorActionPreference = 'Continue'
$Source  = 'D:\Information management system'
$Dest    = '\\Sideburnt\NorthField\IMS BACKUP'
$Stamp   = Get-Date -Format 'yyyy-MM-dd'
$Logs    = Join-Path $Dest 'logs'
$Log     = Join-Path $Logs "backup-$Stamp.log"
$Started = Get-Date
$Problems = @()

function Say($m) { $line = "$(Get-Date -Format 'HH:mm:ss')  $m"; Write-Host $line; Add-Content -Path $Log -Value $line }

if (-not (Test-Path $Dest)) { Write-Error "Can't reach $Dest - is the NAS on?"; exit 1 }
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
Say "IMS backup started -> $Dest"

# 1. Databases: consistent online snapshots
$DbDir = Join-Path $Dest "databases\$Stamp"
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
$out = & $node (Join-Path $PSScriptRoot 'snapshot-databases.mjs') $DbDir 2>&1
$out | ForEach-Object { Say "  db: $_" }
if ($LASTEXITCODE -ne 0) { $Problems += 'database snapshot' }
Get-ChildItem (Join-Path $Dest 'databases') -Directory | Sort-Object Name -Descending | Select-Object -Skip 30 | Remove-Item -Recurse -Force

# 2. The project folder. /E copies everything (no purge: never deletes from the backup); /XJ skips junction links
#    (C:\imsfw points back into this folder anyway); the live database files are left to the snapshots above.
Say 'Copying the project folder...'
$rc = Join-Path $Logs "robocopy-$Stamp.log"
robocopy $Source (Join-Path $Dest 'project') /E /COPY:DAT /DCOPY:DAT /XJ /MT:16 /R:2 /W:5 /NP /NFL /NDL `
  /XF 'app.db' 'app.db-wal' 'app.db-shm' 'home-assistant_v2.db' 'home-assistant_v2.db-wal' 'home-assistant_v2.db-shm' `
  /UNILOG:$rc | Out-Null
$code = $LASTEXITCODE
$summary = Get-Content $rc -Tail 12 | Where-Object { $_ -match '^\s*(Dirs|Files|Bytes)\s*:' }
$summary | ForEach-Object { Say "  $($_.Trim())" }
# Ims deletes short-lived files (e.g. wake-check recordings) while he runs; a file that vanished mid-copy isn't a problem
$failed = @(Get-Content $rc | ForEach-Object { if ($_ -match 'ERROR \d+ \(0x[0-9A-Fa-f]+\) Copying File (.+)$') { $Matches[1].Trim() } } | Sort-Object -Unique)
$realFails = @($failed | Where-Object { Test-Path -LiteralPath $_ })
if ($code -ge 8 -and $failed.Count -gt 0 -and $realFails.Count -eq 0) {
  Say "  project copy ok (robocopy exit $code - $($failed.Count) file(s) deleted during the copy, nothing lost)"
} elseif ($code -ge 8) { $Problems += "project copy (robocopy exit $code - see $rc)" } else { Say "  project copy ok (robocopy exit $code)" }

# 3. Git history as a single restorable file
$GitDir = Join-Path $Dest 'git'
New-Item -ItemType Directory -Force -Path $GitDir | Out-Null
$bundle = Join-Path $GitDir "ims-$Stamp.bundle"
git -C $Source bundle create $bundle --all 2>&1 | ForEach-Object { Say "  git: $_" }
if ($LASTEXITCODE -ne 0) { $Problems += 'git bundle' } else { Say "  git bundle ok ($([math]::Round((Get-Item $bundle).Length / 1MB, 1)) MB)" }
Get-ChildItem $GitDir -Filter 'ims-*.bundle' | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item -Force

# 4. Claude's notes and history for the project, and the Windows startup shortcuts
$claude = Join-Path $env:USERPROFILE '.claude\projects\d--Information-management-system'
if (Test-Path $claude) {
  robocopy $claude (Join-Path $Dest 'claude-project') /E /COPY:DAT /R:1 /W:2 /NP /NFL /NDL /NJH /NJS | Out-Null
  if ($LASTEXITCODE -ge 8) { $Problems += 'Claude project folder' } else { Say '  Claude project folder ok' }
}
$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$su = Join-Path $Dest 'windows-startup'
New-Item -ItemType Directory -Force -Path $su | Out-Null
Get-ChildItem $startup -Filter '*.lnk' | Where-Object { $_.Name -match 'IMS|silent_launcher' } | Copy-Item -Destination $su -Force
Say '  startup shortcuts ok'

# 5. Restore instructions travel with the backup
Copy-Item (Join-Path $PSScriptRoot 'RESTORE.md') (Join-Path $Dest 'RESTORE.md') -Force -ErrorAction SilentlyContinue

Get-ChildItem $Logs -Filter '*.log' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 60 | Remove-Item -Force
$mins = [math]::Round(((Get-Date) - $Started).TotalMinutes, 1)
$result = if ($Problems.Count) { "PROBLEMS: $($Problems -join '; ')" } else { 'OK' }
Say "Finished in $mins min - $result"
Set-Content -Path (Join-Path $Dest 'LAST_BACKUP.txt') -Value "Last IMS backup: $(Get-Date -Format 'yyyy-MM-dd HH:mm') - $result ($mins min). Log: logs\backup-$Stamp.log"
exit ([int]($Problems.Count -gt 0))
