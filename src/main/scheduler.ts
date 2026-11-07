// Scheduled auto-delete was removed in 0.4.0: works stay until the teacher deletes them.
// Versions up to 0.3.0 registered per-work tasks under \ScoreCheck\ in Task Scheduler. This removes any that are
// left, so an old task never starts the app at an odd hour. Current user only, no admin rights.
import { execFile } from 'node:child_process'

export function removeLegacyCleanupTasks(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "Get-ScheduledTask -TaskPath '\\ScoreCheck\\' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue; 'ok'"
      ],
      { windowsHide: true, timeout: 30000, encoding: 'utf8' },
      (err) => resolve(!err)
    )
  })
}
