// Windows Mobile Hotspot control through the bundled PowerShell script (WinRT tethering API).
import { app } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'

export interface HotspotStatus {
  ok: boolean
  state?: 'On' | 'Off' | 'InTransition' | 'Unknown'
  clients?: number
  ssid?: string
  passphrase?: string
  error?: string
  status?: string
  message?: string
}

function scriptPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'hotspot.ps1') : path.join(app.getAppPath(), 'resources', 'hotspot.ps1')
}

function run(action: 'status' | 'start' | 'stop'): Promise<HotspotStatus> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath(), action],
      { windowsHide: true, timeout: 30000, encoding: 'utf8' },
      (_err, stdout) => {
        const line = stdout.trim().split(/\r?\n/).pop() ?? ''
        try {
          resolve(JSON.parse(line) as HotspotStatus)
        } catch {
          resolve({ ok: false, error: 'SCRIPT_FAILED', message: line.slice(0, 200) })
        }
      }
    )
  })
}

let startedByApp = false

export async function hotspotStatus() {
  return run('status')
}

export async function hotspotStart() {
  const before = await run('status')
  if (before.ok && before.state === 'On') return before
  const r = await run('start')
  if (r.ok) startedByApp = true
  return r
}

/** Turns the hotspot off only if this app turned it on. */
export async function hotspotStopIfOurs() {
  if (!startedByApp) return
  startedByApp = false
  await run('stop')
}

export function hotspotErrorText(s: HotspotStatus): string {
  switch (s.error) {
    case 'NO_SOURCE_CONNECTION':
      return '이 PC가 인터넷(Wi-Fi 또는 유선)에 연결되어 있어야 핫스팟을 켤 수 있습니다.'
    case 'NOT_CAPABLE':
      return '이 PC에서는 모바일 핫스팟을 쓸 수 없습니다. (무선랜이 없거나 학교 정책으로 막혀 있음)'
    case 'START_FAILED':
      return `핫스팟을 켜지 못했습니다. (${s.status ?? ''} ${s.message ?? ''})`.trim()
    default:
      return `핫스팟 상태를 확인하지 못했습니다. ${s.message ?? ''}`.trim()
  }
}
