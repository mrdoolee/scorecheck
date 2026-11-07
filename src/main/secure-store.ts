// Encryption at rest for everything inside the works folder (scores, names, signatures, NEIS copies, PDFs).
//
// - One random AES-256 key per Windows user, stored in userData/keystore.bin, itself encrypted with Windows DPAPI
//   through Electron safeStorage. Only the same Windows account on the same PC can unlock it.
// - Each file: "SCENC1" + 12-byte IV + 16-byte GCM tag + ciphertext. Files without the header are legacy
//   plaintext (written before 0.4.0) and are still read; `migrateToEncrypted` rewrites them.
// - If DPAPI is unavailable, files are written as plaintext and an error code is recorded for diagnostics.
import { app, safeStorage } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const MAGIC = Buffer.from('SCENC1', 'ascii')
const IV = 12
const TAG = 16

let key: Buffer | null | undefined
let lastError: string | null = null

const keyPath = () => path.join(app.getPath('userData'), 'keystore.bin')

function loadKey(): Buffer | null {
  if (key !== undefined) return key
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      lastError = 'ENCRYPTION_UNAVAILABLE'
      return (key = null)
    }
    const p = keyPath()
    if (fs.existsSync(p)) {
      const hex = safeStorage.decryptString(fs.readFileSync(p))
      if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('bad key')
      return (key = Buffer.from(hex, 'hex'))
    }
    const fresh = crypto.randomBytes(32)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    const tmp = `${p}.${process.pid}.tmp`
    fs.writeFileSync(tmp, safeStorage.encryptString(fresh.toString('hex')))
    fs.renameSync(tmp, p)
    return (key = fresh)
  } catch (e) {
    // An existing key that cannot be unlocked (e.g. another Windows account) must not be replaced: that would
    // make every stored work unreadable for good. Keep failing loudly instead.
    lastError = 'KEY_UNLOCK_FAILED'
    throw e
  }
}

export function isSealed(buf: Uint8Array): boolean {
  return buf.length >= MAGIC.length + IV + TAG && Buffer.from(buf.subarray(0, MAGIC.length)).equals(MAGIC)
}

/** Encrypts bytes for disk. Returns the input unchanged when encryption is unavailable. */
export function seal(plain: Uint8Array): Buffer {
  const k = loadKey()
  if (!k) return Buffer.from(plain)
  const iv = crypto.randomBytes(IV)
  const c = crypto.createCipheriv('aes-256-gcm', k, iv)
  const body = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body])
}

/** Decrypts bytes read from disk. Legacy plaintext (no header) is returned as is. */
export function unseal(buf: Uint8Array): Buffer {
  if (!isSealed(buf)) return Buffer.from(buf)
  const k = loadKey()
  if (!k) throw new Error('encrypted file but no key')
  const b = Buffer.from(buf)
  const iv = b.subarray(MAGIC.length, MAGIC.length + IV)
  const tag = b.subarray(MAGIC.length + IV, MAGIC.length + IV + TAG)
  const d = crypto.createDecipheriv('aes-256-gcm', k, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(b.subarray(MAGIC.length + IV + TAG)), d.final()])
}

export function encryptionActive(): boolean {
  try {
    return loadKey() !== null
  } catch {
    return false
  }
}

export function encryptionError(): string | null {
  return lastError
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (!e.name.endsWith('.tmp')) out.push(p)
  }
  return out
}

/** Rewrites plaintext files under `dir` in encrypted form. Returns how many files were converted. */
export function migrateToEncrypted(dir: string): number {
  if (!encryptionActive()) return 0
  let n = 0
  for (const p of walk(dir)) {
    try {
      const buf = fs.readFileSync(p)
      if (isSealed(buf)) continue
      const tmp = `${p}.${process.pid}.tmp`
      fs.writeFileSync(tmp, seal(buf))
      fs.renameSync(tmp, p)
      n++
    } catch {
      lastError = 'MIGRATE_FAILED'
    }
  }
  return n
}
