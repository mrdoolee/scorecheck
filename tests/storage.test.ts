import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scorecheck-storage-'))
// Stand-in for Windows DPAPI: reversible, but the key file never holds the raw key text.
vi.mock('electron', () => ({
  app: { getPath: () => tmp },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from([...Buffer.from(s, 'utf8')].map((b) => b ^ 0x5a)),
    decryptString: (b: Buffer) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString('utf8')
  }
}))

const { createWork, deleteSignatures, deleteWork, listWorks, loadSignature, loadWork, readSource, saveItemInfo, saveProgress, saveSignature, worksRoot, writeOutput } = await import('../src/main/storage')
const { isSealed, migrateToEncrypted } = await import('../src/main/secure-store')

const view = {
  profile: 'regular-exam',
  meta: {},
  areas: [],
  items: [{ no: 1, answer: '1', points: 5 }],
  classNos: [1],
  students: [
    { key: '1-1', classNo: 1, number: 1, studentNo: '', name: '홍길동', scores: { total: 5 }, signRequired: true },
    { key: '1-2', classNo: 1, number: 2, studentNo: '', name: 'y', scores: { total: 0 }, signRequired: true }
  ],
  classStats: {},
  gradeStats: {},
  gradeCoverage: { classNos: [1], wholeGrade: null },
  cellAspect: null
} as never

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('work storage deletes', () => {
  it('deletes only signatures, keeping scores, 문항정보, and checked marks', () => {
    const w = createWork({ workName: '시험', wholeGradeConfirmed: false, view, sourcePaths: [], pdfDetections: {} })
    saveSignature(w.workId, { studentKey: '1-1', requestId: 'r1', canvas: { w: 10, h: 3 }, strokes: [[[0, 0, 0]]] })
    saveProgress(w.workId, { checked: { '1-1': true }, signed: { '1-1': true } })
    saveItemInfo(w.workId, { rows: [{ area: '밀도', standard: '' }], updatedAt: '' })
    writeOutput(w.workId, 'a.pdf', new Uint8Array([1]))
    expect(listWorks()[0]!.signed).toBe(1)

    deleteSignatures(w.workId)
    const after = loadWork(w.workId)
    expect(loadSignature(w.workId, '1-1')).toBeNull()
    expect(after.progress).toEqual({ checked: { '1-1': true }, signed: {} })
    expect(after.itemInfo?.rows[0]?.area).toBe('밀도')
    expect(after.view.students).toHaveLength(2)
    expect(fs.existsSync(path.join(tmp, 'works', w.workId, 'output'))).toBe(false)
    expect(listWorks()[0]!.signed).toBe(0)

    // signing again works after a delete
    saveSignature(w.workId, { studentKey: '1-1', requestId: 'r2', canvas: { w: 10, h: 3 }, strokes: [[[0, 0, 0]]] })
    expect(loadSignature(w.workId, '1-1')?.revision).toBe(1)
  })

  it('deletes a whole work', () => {
    const w = createWork({ workName: '지울 작업', wholeGradeConfirmed: false, view, sourcePaths: [], pdfDetections: {} })
    deleteWork(w.workId)
    expect(fs.existsSync(path.join(tmp, 'works', w.workId))).toBe(false)
    expect(listWorks().some((x) => x.workId === w.workId)).toBe(false)
  })
})

const allFiles = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? allFiles(path.join(d, e.name)) : [path.join(d, e.name)]))

describe('encryption at rest', () => {
  it('never writes names, scores, or source files in plaintext', () => {
    const src = path.join(tmp, 'neis-1반.xlsx')
    fs.writeFileSync(src, '홍길동 원본 파일')
    const w = createWork({ workName: '암호화', wholeGradeConfirmed: false, view, sourcePaths: [src], pdfDetections: {} })
    saveSignature(w.workId, { studentKey: '1-1', requestId: 'r1', canvas: { w: 10, h: 3 }, strokes: [[[1, 2, 3]]] })
    const files = allFiles(path.join(worksRoot(), w.workId))
    expect(files.length).toBeGreaterThan(4)
    for (const f of files) {
      const raw = fs.readFileSync(f)
      expect(isSealed(raw)).toBe(true)
      expect(raw.toString('utf8')).not.toContain('홍길동')
    }
    expect(fs.readFileSync(path.join(tmp, 'keystore.bin')).toString('utf8')).not.toMatch(/^[0-9a-f]{64}$/)
    expect(Buffer.from(readSource(w.workId, 'src-01.xlsx')).toString('utf8')).toBe('홍길동 원본 파일')
    expect(loadWork(w.workId).view.students[0]!.name).toBe('홍길동')
  })

  it('reads and then encrypts works saved in plaintext by older versions', () => {
    const id = 'a'.repeat(32)
    const d = path.join(worksRoot(), id)
    fs.mkdirSync(path.join(d, 'data'), { recursive: true })
    fs.writeFileSync(path.join(d, 'work.json'), JSON.stringify({ workId: id, workName: '옛 작업', createdAt: '2026-10-01T00:00:00Z', wholeGradeConfirmed: false, pdfs: {} }))
    fs.writeFileSync(path.join(d, 'data', 'view.json'), JSON.stringify(view))
    expect(loadWork(id).view.students[0]!.name).toBe('홍길동')
    expect(migrateToEncrypted(worksRoot())).toBeGreaterThanOrEqual(2)
    expect(isSealed(fs.readFileSync(path.join(d, 'data', 'view.json')))).toBe(true)
    expect(loadWork(id).work.workName).toBe('옛 작업')
    expect(migrateToEncrypted(worksRoot())).toBe(0)
  })

  it('rejects a tampered file', () => {
    const w = createWork({ workName: '변조', wholeGradeConfirmed: false, view, sourcePaths: [], pdfDetections: {} })
    const p = path.join(worksRoot(), w.workId, 'data', 'view.json')
    const raw = fs.readFileSync(p)
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 1
    fs.writeFileSync(p, raw)
    expect(() => loadWork(w.workId)).toThrow()
  })
})
