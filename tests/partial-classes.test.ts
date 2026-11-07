// A teacher usually teaches only some classes of a grade. These tests import 2 of the 7 sample classes:
// 정기고사 with and without the whole-grade 일람표, and 수행평가 (which has no whole-grade file).
import fs from 'node:fs'
import path from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { importFiles, type InputFile } from '../src/core/import/assemble'
import { readGrid } from '../src/core/import/xlsx'
import { detectKind } from '../src/core/import/detect'
import { parseAnswerSheet, parsePerformanceClass } from '../src/core/import/parsers'
import { compare, itemCorrectRates } from '../src/core/stats/display'
import { feedbackFor } from '../src/core/feedback/feedback'
import { round, summarize } from '../src/core/stats/stats'
import { detectPdf } from '../src/core/pdf/detect'
import { validatePdfs } from '../src/core/validate/pdf'
import { composePdf } from '../src/core/pdf/compose'
import { areaStats, examTakers, itemStats } from '../src/core/item-analysis/analysis'
import { exportSheets } from '../src/core/item-analysis/export'

const root = path.resolve(__dirname, '..', 'sample_data')
const has = fs.existsSync(root)
const PICK = [2, 5] // 5반 has a missing number (25번 결번)

function load(dir: string) {
  const xlsx: (InputFile & { classNo?: number; kind: string })[] = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.xlsx'))
    .map((f) => {
      const grid = readGrid(fs.readFileSync(path.join(dir, f)))
      const kind = detectKind(grid) ?? 'unknown'
      const classNo =
        kind === 'answer-sheet' ? parseAnswerSheet(grid, f).students[0]?.classNo : kind === 'performance-class' ? parsePerformanceClass(grid, f).students[0]?.classNo : undefined
      return { fileName: f, grid, kind, classNo }
    })
  const pdfs = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')).map((f) => ({ fileName: f, bytes: new Uint8Array(fs.readFileSync(path.join(dir, f))) }))
  return { xlsx, pdfs }
}

async function pdfsFor(pdfs: { fileName: string; bytes: Uint8Array }[], classes: number[]) {
  const out = []
  for (const p of pdfs) {
    const detection = await detectPdf(p.bytes, pdfjs as never)
    if (detection.classNo !== null && classes.includes(detection.classNo)) out.push({ ...p, detection })
  }
  return out
}

const fakeSig = { canvas: { w: 300, h: 100 }, strokes: [[[0.1, 0.5, 0], [0.5, 0.2, 10], [0.9, 0.6, 20]]] as [number, number, number][][] }

describe.skipIf(!has)('정기고사 — 2개 반만', () => {
  const all = has ? load(root) : { xlsx: [], pdfs: [] }
  const sheets = all.xlsx.filter((f) => f.kind === 'answer-sheet' && PICK.includes(f.classNo!))
  const summary = all.xlsx.filter((f) => f.kind === 'grade-summary')
  const everySheet = all.xlsx.filter((f) => f.kind === 'answer-sheet')

  for (const withSummary of [true, false]) {
    it(`imports and computes averages ${withSummary ? 'with' : 'without'} the whole-grade 일람표`, async () => {
      const r = importFiles([...sheets, ...(withSummary ? summary : [])])
      const a = r.assessment!
      if (process.env['SHOW']) console.log(withSummary ? 'WITH' : 'WITHOUT', r.issues.map((i) => `${i.level}:${i.code}`).join(' '), JSON.stringify(a.gradeCoverage))
      expect(r.rejected).toEqual([])
      expect(r.issues.filter((i) => i.level === 'error')).toEqual([])
      expect(a.classNos).toEqual(PICK)
      expect(a.students.every((s) => PICK.includes(s.classNo))).toBe(true)

      // Class averages match the same classes imported together with all 7 classes.
      const full = importFiles(everySheet).assessment!
      for (const c of PICK) expect(a.classStats[c]!.total!.mean).toBeCloseTo(full.classStats[c]!.total!.mean!, 9)

      const takers = a.students.filter((s) => typeof s.scores.total === 'number').map((s) => s.scores.total as number)
      if (withSummary) {
        // Grade average still covers the whole grade (NEIS 학년 일람표): 50.7 over 197 students.
        expect(a.gradeCoverage.wholeGrade).toBe(true)
        expect(round(a.gradeStats.total!.mean!, 1)).toBe(50.7)
        expect(a.gradeStats.total!.count).toBe(197)
        // The teacher is told which numbers use the whole grade and which use only their classes.
        expect(r.issues.find((i) => i.code === 'PARTIAL_CLASSES_WITH_SUMMARY')?.message).toContain('2개 반(2, 5반)')
      } else {
        // Without it, the "grade" average is only the imported classes, and the app must say so.
        expect(a.gradeCoverage.wholeGrade).toBe(null)
        expect(a.gradeStats.total!.count).toBe(takers.length)
        expect(a.gradeStats.total!.mean).toBeCloseTo(summarize(takers).mean!, 9)
        expect(r.issues.some((i) => i.code === 'NO_GRADE_SUMMARY')).toBe(true)
      }

      // Student screen numbers
      const s = a.students.find((x) => x.classNo === PICK[0] && typeof x.scores.total === 'number')!
      const c = compare(a, s).find((x) => x.areaId === 'total')!
      expect(c.diffClass).toBeCloseTo(round(s.scores.total! - round(a.classStats[s.classNo]!.total!.mean!, 1), 1), 9)
      expect(c.diffGrade).toBeCloseTo(round(s.scores.total! - round(a.gradeStats.total!.mean!, 1), 1), 9)

      // Item correct rates use only the imported classes.
      const rates = itemCorrectRates(a.students, a.items.length)
      const n = examTakers(a.students).length
      expect(n).toBe(takers.length)
      expect(rates[0]).toBeCloseTo(examTakers(a.students).filter((x) => x.responses![0] === '.').length / n, 9)
      // Feedback uses the same label as the screen ("학년 평균(2개 반 기준)" without the whole-grade file).
      const label = withSummary ? '학년 평균' : '학년 평균(2개 반 기준)'
      const lines = feedbackFor(a.profile, s, compare(a, s), a.items, rates, undefined, null, label)
      expect(lines.some((l) => l.startsWith(`${label}보다`) || l.startsWith(`${label}과`))).toBe(true)

      // Analysis and export cover the two classes only.
      const st = itemStats(a.students, a.items, a.classNos)
      expect(Object.keys(st[0]!.classRates).map(Number)).toEqual(PICK)
      const sheetsOut = exportSheets(a, null)
      expect(JSON.stringify(sheetsOut)).not.toContain(s.name)

      // PDFs: only the two classes, every student row found, composing works.
      const pdfs = await pdfsFor(all.pdfs, PICK)
      expect(pdfs.map((p) => p.detection.classNo).sort()).toEqual(PICK)
      const pdfIssues = validatePdfs(pdfs, a.students, a.classNos)
      expect(pdfIssues.filter((i) => i.level === 'error')).toEqual([])
      const p = pdfs[0]!
      const out = await composePdf(p.bytes, [{ cell: p.detection.cells[0]!, ...fakeSig }])
      expect(out.length).toBeGreaterThan(p.bytes.length)
    })
  }
})

describe.skipIf(!has)('수행평가 — 2개 반만 (학년 전체 자료 없음)', () => {
  const all = has ? load(path.join(root, 'suhaeng')) : { xlsx: [], pdfs: [] }
  const files = all.xlsx.filter((f) => f.kind === 'performance-class' && PICK.includes(f.classNo!))
  const everyFile = all.xlsx.filter((f) => f.kind === 'performance-class')

  it('imports, computes averages, and works end to end', async () => {
    const r = importFiles(files)
    const a = r.assessment!
    if (process.env['SHOW']) console.log('PERF', r.issues.map((i) => `${i.level}:${i.code}`).join(' '), JSON.stringify(a.gradeCoverage))
    expect(r.rejected).toEqual([])
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([])
    expect(a.classNos).toEqual(PICK)
    expect(a.gradeCoverage.wholeGrade).toBe(null)
    expect(r.issues.some((i) => i.code === 'CONFIRM_WHOLE_GRADE')).toBe(true)

    const full = importFiles(everyFile).assessment!
    for (const c of PICK) for (const area of a.areas) expect(a.classStats[c]![area.id]!.mean).toBeCloseTo(full.classStats[c]![area.id]!.mean!, 9)
    for (const area of a.areas) {
      const vals = a.students.map((s) => s.scores[area.id]).filter((v): v is number => typeof v === 'number')
      expect(a.gradeStats[area.id]!.mean).toBeCloseTo(summarize(vals).mean!, 9)
      expect(a.gradeStats[area.id]!.count).toBe(vals.length)
    }
    if (process.env['SHOW']) {
      const g = Object.fromEntries(a.areas.map((ar) => [ar.name, round(a.gradeStats[ar.id]!.mean!, 2)]))
      const gf = Object.fromEntries(full.areas.map((ar) => [ar.name, round(full.gradeStats[ar.id]!.mean!, 2)]))
      console.log('PERF grade (2 classes)', JSON.stringify(g), 'vs all 7', JSON.stringify(gf))
    }

    const s = a.students.find((x) => typeof x.scores['total'] === 'number' || Object.values(x.scores).some((v) => typeof v === 'number'))!
    const comps = compare(a, s)
    expect(comps.every((c) => c.classMean !== null && c.gradeMean !== null)).toBe(true)
    const lines = feedbackFor(a.profile, s, comps, a.items, [], undefined, null, '학년 평균(2개 반 기준)')
    expect(lines.some((l) => l.startsWith('합계는 학년 평균(2개 반 기준)'))).toBe(true)

    const st = areaStats(a.students, a.areas, a.classNos)
    expect(Object.keys(st[0]!.classMeans).map(Number)).toEqual(PICK)

    const pdfs = await pdfsFor(all.pdfs, PICK)
    const pdfIssues = validatePdfs(pdfs, a.students, a.classNos)
    expect(pdfIssues.filter((i) => i.level === 'error')).toEqual([])
    const out = await composePdf(pdfs[0]!.bytes, [{ cell: pdfs[0]!.detection.cells[0]!, ...fakeSig }])
    expect(out.length).toBeGreaterThan(pdfs[0]!.bytes.length)
  })
})
