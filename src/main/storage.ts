// Work storage under %APPDATA%/<app>/works/<workId>/. One folder per work, so a delete removes it whole.
// File names never contain student names or IDs. Every file is encrypted at rest (secure-store.ts).
import { app } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { ImportView } from '../shared/ipc'
import type { PdfDetection, Rect, RemarkCell } from '../core/pdf/detect'
import { sanitizeInfo, type ItemInfo } from '../core/item-analysis/info'
import { seal, unseal } from './secure-store'

export interface StoredWork {
  workId: string
  workName: string
  createdAt: string
  wholeGradeConfirmed: boolean
  /** classNo -> stored PDF (inside source/) and its detected 비고 cells. */
  pdfs: Record<number, { file: string; originalName: string; cells: RemarkCell[]; headers?: Record<number, Rect> }>
}

export interface StoredSignature {
  studentKey: string
  revision: number
  requestId: string
  canvas: { w: number; h: number }
  strokes: number[][][]
  createdAt: string
}

const root = () => path.join(app.getPath('userData'), 'works')
const dir = (workId: string) => {
  if (!/^[0-9a-f]{32}$/.test(workId)) throw new Error('bad work id')
  return path.join(root(), workId)
}
const readJson = <T>(p: string, fallback: T): T => (fs.existsSync(p) ? (JSON.parse(unseal(fs.readFileSync(p)).toString('utf8')) as T) : fallback)

/** Encrypts, writes to a temp file, then renames, so a crash never leaves a half-written file. */
function writeAtomic(p: string, bytes: Uint8Array) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.${process.pid}.tmp`
  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeSync(fd, seal(bytes))
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, p)
}

const writeJsonAtomic = (p: string, data: unknown) => writeAtomic(p, Buffer.from(JSON.stringify(data), 'utf8'))

export function createWork(input: {
  workName: string
  wholeGradeConfirmed: boolean
  view: ImportView
  sourcePaths: string[]
  pdfDetections: Record<string, PdfDetection>
}): StoredWork {
  const workId = crypto.randomBytes(16).toString('hex')
  const d = dir(workId)
  fs.mkdirSync(path.join(d, 'source'), { recursive: true })
  const pdfs: StoredWork['pdfs'] = {}
  input.sourcePaths.forEach((src, i) => {
    const ext = path.extname(src).toLowerCase()
    const name = `src-${String(i + 1).padStart(2, '0')}${ext}`
    writeAtomic(path.join(d, 'source', name), fs.readFileSync(src))
    const det = input.pdfDetections[src]
    if (ext === '.pdf' && det?.classNo != null && !pdfs[det.classNo])
      pdfs[det.classNo] = { file: name, originalName: path.basename(src), cells: det.cells, headers: det.headers }
  })
  const work: StoredWork = {
    workId,
    workName: input.workName,
    createdAt: new Date().toISOString(),
    wholeGradeConfirmed: input.wholeGradeConfirmed,
    pdfs
  }
  writeJsonAtomic(path.join(d, 'work.json'), work)
  writeJsonAtomic(path.join(d, 'data', 'view.json'), input.view)
  writeJsonAtomic(path.join(d, 'data', 'progress.json'), { checked: {}, signed: {} })
  return work
}

export function saveProgress(workId: string, progress: unknown) {
  writeJsonAtomic(path.join(dir(workId), 'data', 'progress.json'), progress)
}

type SigIndex = Record<string, { file: string; revision: number; requestIds: string[] }>

/** Saves a signature. Idempotent per requestId: a repeated request returns the earlier revision. */
export function saveSignature(workId: string, sig: Omit<StoredSignature, 'revision' | 'createdAt'>): { revision: number; duplicate: boolean } {
  const d = dir(workId)
  const indexPath = path.join(d, 'signatures', 'index.json')
  const index = readJson<SigIndex>(indexPath, {})
  const entry = index[sig.studentKey]
  if (entry?.requestIds.includes(sig.requestId)) return { revision: entry.revision, duplicate: true }

  const revision = (entry?.revision ?? 0) + 1
  const file = `${crypto.randomBytes(12).toString('hex')}.json`
  const stored: StoredSignature = { ...sig, revision, createdAt: new Date().toISOString() }
  writeJsonAtomic(path.join(d, 'signatures', file), stored)
  index[sig.studentKey] = { file, revision, requestIds: [...(entry?.requestIds ?? []), sig.requestId].slice(-20) }
  writeJsonAtomic(indexPath, index)
  // Keep only the latest revision on disk (revision history policy is still open; see blueprint).
  if (entry && entry.file !== file) fs.rmSync(path.join(d, 'signatures', entry.file), { force: true })
  return { revision, duplicate: false }
}

export function loadSignature(workId: string, studentKey: string): StoredSignature | null {
  const d = dir(workId)
  const index = readJson<SigIndex>(path.join(d, 'signatures', 'index.json'), {})
  const e = index[studentKey]
  return e ? readJson<StoredSignature | null>(path.join(d, 'signatures', e.file), null) : null
}

export function workDir(workId: string) {
  return dir(workId)
}

export function loadWork(workId: string): {
  work: StoredWork
  view: ImportView
  progress: { checked: Record<string, boolean>; signed: Record<string, boolean> }
  itemInfo: ItemInfo | null
} {
  const d = dir(workId)
  const view = readJson<ImportView>(path.join(d, 'data', 'view.json'), null as unknown as ImportView)
  return {
    work: readJson<StoredWork>(path.join(d, 'work.json'), null as unknown as StoredWork),
    view,
    progress: readJson(path.join(d, 'data', 'progress.json'), { checked: {}, signed: {} }),
    itemInfo: view ? sanitizeInfo(readJson<unknown>(path.join(d, 'data', 'item-info.json'), null), view.items.length) : null
  }
}

/** 문항정보 typed in by the teacher (optional). Deleted with the work. */
export function saveItemInfo(workId: string, info: ItemInfo | null) {
  const p = path.join(dir(workId), 'data', 'item-info.json')
  if (info) writeJsonAtomic(p, info)
  else fs.rmSync(p, { force: true })
}

export function readSource(workId: string, file: string): Uint8Array {
  if (!/^src-\d{2}\.(pdf|xlsx?|xls)$/i.test(file)) throw new Error('bad source name')
  return new Uint8Array(unseal(fs.readFileSync(path.join(dir(workId), 'source', file))))
}

export function writeOutput(workId: string, name: string, bytes: Uint8Array): string {
  const p = path.join(dir(workId), 'output', name)
  writeAtomic(p, bytes)
  return p
}

/** Remembers files the teacher exported outside the work folder (they cannot be auto-deleted). */
export function recordExport(workId: string, filePath: string) {
  const p = path.join(dir(workId), 'work.json')
  const w = readJson<StoredWork & { exports?: string[] }>(p, null as unknown as StoredWork)
  w.exports = [...new Set([...(w.exports ?? []), filePath])]
  writeJsonAtomic(p, w)
}

export interface WorkSummary {
  workId: string
  workName: string
  createdAt: string
  students: number
  signed: number
}

export function listWorks(): WorkSummary[] {
  if (!fs.existsSync(root())) return []
  return fs
    .readdirSync(root())
    .filter((n) => /^[0-9a-f]{32}$/.test(n))
    .flatMap((id) => {
      try {
        const { work, view, progress } = loadWork(id)
        if (!work || !view) return []
        const signed = view.students.filter((s) => s.signRequired && progress.signed[s.key]).length
        return [{ workId: id, workName: work.workName, createdAt: work.createdAt, students: view.students.filter((s) => s.signRequired).length, signed }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Deletes the whole work folder. Retries briefly in case a file is still open (e.g. a PDF preview). */
export function deleteWork(workId: string) {
  fs.rmSync(dir(workId), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  if (fs.existsSync(dir(workId))) throw new Error('work folder still exists')
}

/**
 * Deletes every received signature of a work, plus the composed PDFs kept inside the work folder (they contain
 * the signatures). Scores, 문항정보, and the original NEIS files stay. "성적 확인" marks stay; "서명 완료" marks reset.
 */
export function deleteSignatures(workId: string) {
  const d = dir(workId)
  for (const sub of ['signatures', 'output']) fs.rmSync(path.join(d, sub), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  const p = path.join(d, 'data', 'progress.json')
  const progress = readJson<{ checked?: Record<string, boolean>; signed?: Record<string, boolean> }>(p, {})
  writeJsonAtomic(p, { checked: progress.checked ?? {}, signed: {} })
  if (fs.existsSync(path.join(d, 'signatures'))) throw new Error('signatures still exist')
}

export function worksRoot() {
  return root()
}
