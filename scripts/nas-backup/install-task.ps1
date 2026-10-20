# Sets up the nightly IMS NAS backup in Task Scheduler: 03:30 every night (after IMS's own 03:00 backup), and as
# soon as possible after a missed run if the PC was off. It runs as Simon while he's signed in, which is when it can
# reach the NAS with his saved network credentials. Uses schtasks.exe (the ScheduledTasks cmdlets don't load in
# every PowerShell on this PC).
$script = Join-Path $PSScriptRoot 'ims-nas-backup.ps1'
$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = (Get-Command powershell.exe).Source }
$user = "$env:USERDOMAIN\$env:USERNAME"
$start = (Get-Date).Date.AddDays(1).AddHours(3.5).ToString('yyyy-MM-ddTHH:mm:ss')
$esc = { param($s) [System.Security.SecurityElement]::Escape($s) }
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Nightly IMS disaster-recovery backup to \\Sideburnt\NorthField\IMS BACKUP (scripts\nas-backup)</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$start</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$(& $esc $user)</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT6H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$(& $esc $pwsh)</Command>
      <Arguments>-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$(& $esc $script)"</Arguments>
    </Exec>
  </Actions>
</Task>
"@
$tmp = Join-Path $env:TEMP 'ims-nas-backup-task.xml'
[System.IO.File]::WriteAllText($tmp, $xml, [System.Text.Encoding]::Unicode)
schtasks /Create /TN 'IMS NAS backup' /XML $tmp /F
Remove-Item $tmp -Force
schtasks /Query /TN 'IMS NAS backup' /FO LIST | Select-String 'TaskName|Next Run Time|Status'
