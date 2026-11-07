; Remove ScoreCheck's per-user cleanup tasks when the app is uninstalled.
!macro customUnInstall
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-ScheduledTask -TaskPath ''\ScoreCheck\'' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$$false"'
!macroend
