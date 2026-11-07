# Verifies that a per-user scheduled task can be registered, run, and removed without admin rights.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File task-test.ps1
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$taskPath = '\ScoreCheck\'
$taskName = 'phase0-test'
$marker = Join-Path $env:TEMP 'scorecheck-phase0-task.txt'
Remove-Item $marker -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c echo ok> `"$marker`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(20)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Output 'registered: yes (no admin)'

$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-Path $marker) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
$ran = Test-Path $marker
Write-Output ("ran on schedule: " + $(if ($ran) { 'yes' } else { 'no' }))

Unregister-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Confirm:$false
Remove-Item $marker -ErrorAction SilentlyContinue
Write-Output 'removed: yes'
