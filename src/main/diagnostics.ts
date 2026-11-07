// Diagnostic report the teacher can save and send to the developer by hand.
// No personal data: no student or teacher names, no work names, no file paths, no IP addresses, no hotspot
// name or password. The app never sends it anywhere itself.
import { app } from 'electron'
import os from 'node:os'
import { hotspotStatus } from './hotspot'
import { listWorks } from './storage'
import { encryptionActive } from './secure-store'

interface ErrorEntry {
  at: string
  code: string
}

const errors: ErrorEntry[] = []

/** Records an error code (never a message that could hold names or paths). Keeps the last 50. */
export function recordError(code: string) {
  errors.push({ at: new Date().toISOString(), code: code.replace(/[^A-Z0-9_:-]/gi, '').slice(0, 60) })
  if (errors.length > 50) errors.shift()
}

export async function diagnosticReport(): Promise<string> {
  const hs = await hotspotStatus().catch(() => null)
  const ifaces = Object.entries(os.networkInterfaces())
  const works = (() => {
    try {
      return listWorks()
    } catch {
      return []
    }
  })()
  const report = {
    generatedAt: new Date().toISOString(),
    app: { name: '몇점 (ScoreCheck)', version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron, chrome: process.versions.chrome },
    os: { platform: process.platform, release: os.release(), version: typeof os.version === 'function' ? os.version() : '', arch: os.arch(), locale: app.getLocale() },
    hardware: { cpus: os.cpus().length, memoryGB: Math.round(os.totalmem() / 1024 ** 3) },
    network: {
      // Adapter names only (e.g. "Wi-Fi", "로컬 영역 연결* 2"), no addresses.
      adapters: ifaces.map(([name, list]) => ({ name, ipv4: !!list?.some((a) => a.family === 'IPv4' && !a.internal) })),
      wirelessLikely: ifaces.some(([name]) => /wi-?fi|wlan|무선/i.test(name))
    },
    hotspot: hs ? { ok: hs.ok, state: hs.state ?? null, clients: hs.clients ?? null, error: hs.error ?? null, status: hs.status ?? null } : { ok: false, error: 'STATUS_UNAVAILABLE' },
    works: { count: works.length, encryptedAtRest: encryptionActive() },
    recentErrors: errors
  }
  return JSON.stringify(report, null, 2)
}
