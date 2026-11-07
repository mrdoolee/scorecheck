import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyColumn, columnText, emptyInfo, groupBy, joinWrapped, parseColumn, sanitizeInfo, standardCode } from '../src/core/item-analysis/info'
import { areaStats, choiceOf, fullSummary, histogram, infoGroupStats, itemStats } from '../src/core/item-analysis/analysis'
import { exportSheets } from '../src/core/item-analysis/export'
import { feedbackFor, weakestArea } from '../src/core/feedback/feedback'
import type { Item, StudentRecord } from '../src/core/import/types'
import { importFiles } from '../src/core/import/assemble'
import { readGrid } from '../src/core/import/xlsx'

// Lines as they come out of a copy from the sample 문항정보표 PDF: one 성취기준 sentence wraps onto a 2nd line.
const STANDARD_PASTE = `[9과08-01] 물질의 특성의 의미를 알고, 실험을 통해 밀도, 용해도, 녹
는점, 끓는점 등을 설명할 수 있다.
[9과08-01]
[9과08-01]
[9과08-02] 물질의 특성을 근거로 우리 주변의 물질을 순물질과 혼합
물로 분류할 수 있다.`

describe('문항정보 paste', () => {
  it('joins wrapped 성취기준 lines and keeps the item count', () => {
    const r = parseColumn('standard', STANDARD_PASTE, 4)
    expect(r.values).toHaveLength(4)
    expect(r.values[0]).toBe('[9과08-01] 물질의 특성의 의미를 알고, 실험을 통해 밀도, 용해도, 녹는점, 끓는점 등을 설명할 수 있다.')
    expect(r.values[3]).toContain('혼합물로')
    expect(joinWrapped('광물의 활용 ', '방안 및')).toBe('광물의 활용 방안 및')
    expect(joinWrapped('it is', 'fine')).toBe('it is fine')
    expect(r.values[3]).toMatch(/^\[9과08-02\].*분류할 수 있다\.$/)
    expect(r.warnings.join()).toMatch(/이어 붙였습니다/)
  })

  it('warns about too many or too few lines', () => {
    expect(parseColumn('area', 'a\nb\nc', 2).warnings.join()).toMatch(/앞의 2줄만/)
    const few = parseColumn('area', 'a\n\nc', 5)
    expect(few.values).toEqual(['a', '', 'c', '', ''])
    expect(few.warnings.join()).toMatch(/4번부터는 비어/)
    expect(parseColumn('area', '\n\n', 3).warnings).toEqual([])
    // a leading blank line keeps item 1 blank instead of shifting everything up
    expect(parseColumn('area', '\n밀도', 2).values).toEqual(['', '밀도'])
    const info = applyColumn(emptyInfo(3), 'area', ['', '', '광물'])
    expect(parseColumn('area', columnText(info, 'area'), 3).values).toEqual(['', '', '광물'])
  })

  it('groups 성취기준 by code with the full sentence as label', () => {
    let info = emptyInfo(4)
    info = applyColumn(info, 'standard', parseColumn('standard', STANDARD_PASTE, 4).values)
    const g = groupBy(info, 'standard')
    expect(g.map((x) => x.key)).toEqual(['[9과08-01]', '[9과08-02]'])
    expect(g[0]!.items).toEqual([0, 1, 2])
    expect(g[0]!.label).toMatch(/설명할 수 있다/)
    expect(standardCode('[9과 08-01] x')).toBe('[9과08-01]')
  })

  it('sanitizes stored data', () => {
    // older saves may still carry a 난이도 field; it is dropped
    expect(sanitizeInfo({ rows: [{ area: 'a', standard: 3, difficulty: '상' }] }, 1)).toEqual({ rows: [{ area: 'a', standard: '' }], updatedAt: '' })
    expect(sanitizeInfo({ rows: [] }, 1)).toBeNull()
    expect(sanitizeInfo('nope', 1)).toBeNull()
  })
})

// Small synthetic exam: 3 items worth 2, 3, 5 points, answers 1, 2, 3.
const items: Item[] = [
  { no: 1, answer: '1', points: 2 },
  { no: 2, answer: '2', points: 3 },
  { no: 3, answer: '3', points: 5 }
]
const stu = (key: string, classNo: number, responses: string[]): StudentRecord => {
  const total = responses.reduce((s, m, i) => s + (m === '.' ? items[i]!.points! : 0), 0)
  return { key, classNo, number: Number(key.split('-')[1]), studentNo: '', name: 'x', scores: { total }, responses }
}
const students = [
  stu('1-1', 1, ['.', '.', '.']),
  stu('1-2', 1, ['.', '.', '4']),
  stu('1-3', 1, ['.', '3', '-']),
  stu('2-1', 2, ['.', '.', 'A']),
  stu('2-2', 2, ['2', '3', '4']),
  { key: '2-3', classNo: 2, number: 3, studentNo: '', name: 'x', scores: { total: null }, specialStatus: '전출', responses: ['-', '-', '-'] } as StudentRecord
]

describe('item analysis', () => {
  const stats = itemStats(students, items, [1, 2])

  it('ignores students without a numeric total', () => {
    expect(stats[0]!.rate).toBeCloseTo(4 / 5)
    expect(stats[0]!.classRates).toEqual({ 1: 1, 2: 0.5 })
  })

  it('counts options, 무응답 and multiple marks', () => {
    expect(choiceOf('.', '3')).toEqual({ key: '3', kind: 'option' })
    expect(choiceOf('A', '3')).toEqual({ key: '1,2', kind: 'multi' })
    const c = stats[2]!.choices
    expect(c.find((x) => x.key === '3')!.count).toBe(1)
    expect(c.find((x) => x.key === '4')!.count).toBe(2)
    expect(c.find((x) => x.key === '4')!.attractive).toBe(true)
    expect(c.find((x) => x.key === '1,2')!.label).toBe('복수 1,2')
    expect(stats[2]!.noAnswerShare).toBeCloseTo(0.2)
    expect(stats[2]!.multiShare).toBeCloseTo(0.2)
  })

  it('computes discrimination from upper and lower 27%', () => {
    // 5 takers -> groups of 1: top 1-1 (10 points), bottom 2-2 (0 points)
    expect(stats[0]!.discrimination).toBe(1)
    expect(stats[2]!.discrimination).toBe(1)
  })

  it('weights group score rates by points', () => {
    const info = applyColumn(emptyInfo(3), 'area', ['밀도', '밀도', '광물'])
    const g = infoGroupStats(students, items, [1, 2], info, 'area')
    // 밀도: items 1,2 (2+3 points). Earned: 5, 5, 2, 5, 0 = 17 of 25.
    expect(g[0]!.scoreRate).toBeCloseTo(17 / 25)
    expect(g[1]!.scoreRate).toBeCloseTo(1 / 5)
  })

  it('summaries and histograms', () => {
    expect(fullSummary([1, 3, 2, 10]).median).toBe(2.5)
    expect(histogram([0, 5, 9.9, 10], 10, 2).map((b) => b.count)).toEqual([1, 3])
  })

  it('area stats count full and zero scores', () => {
    const a = areaStats(
      [stu('1-1', 1, ['.']), stu('1-2', 1, ['2'])].map((s, i) => ({ ...s, scores: { a1: i ? 0 : 10 } })),
      [{ id: 'a1', name: '실험', maxScore: 10, weightPct: null, isTotal: false }],
      [1]
    )
    expect(a[0]!.fullCount).toBe(1)
    expect(a[0]!.zeroCount).toBe(1)
  })
})

describe('feedback with 문항정보', () => {
  const info = applyColumn(emptyInfo(3), 'area', ['밀도', '밀도', '광물'])
  const rates = itemStats(students, items, [1, 2]).map((s) => s.rate)

  it('names the area with the lowest score rate', () => {
    expect(weakestArea(['.', '.', '4'], items, rates, info)).toBe('광물')
    expect(weakestArea(['.', '.', '.'], items, rates, info)).toBeNull()
    const lines = feedbackFor('regular-exam', students[1]!, [], items, rates, undefined, info)
    expect(lines.at(-1)).toBe("'광물' 영역을 복습하면 도움이 돼요.")
  })

  it('adds nothing without 문항정보', () => {
    const lines = feedbackFor('regular-exam', students[1]!, [], items, rates)
    expect(lines.join()).not.toMatch(/영역을 복습/)
  })
})

describe('export', () => {
  it('writes a valid workbook', async () => {
    const XLSX = await import('xlsx')
    const v2 = { profile: 'regular-exam' as const, meta: {}, areas: [], items, classNos: [1, 2], students }
    const wb = XLSX.utils.book_new()
    for (const s of exportSheets(v2, applyColumn(emptyInfo(3), 'area', ['밀도', '밀도', '광물'])))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name)
    const back = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    expect(back.SheetNames).toHaveLength(5)
  })

  const v = { profile: 'regular-exam' as const, meta: { examName: '1회고사', subject: '과학' }, areas: [], items, classNos: [1, 2], students }

  it('has no student names', () => {
    const named = students.map((s, i) => ({ ...s, name: `학생이름${i}` }))
    const sheets = exportSheets({ ...v, students: named }, applyColumn(emptyInfo(3), 'area', ['밀도', '밀도', '광물']))
    const text = JSON.stringify(sheets)
    expect(text).not.toMatch(/학생이름/)
    expect(sheets.map((s) => s.name)).toEqual(['시험 요약', '문항별', '선택지 분포', '반별 정답률', '문항정보별'])
  })

  it('skips the 문항정보 sheet when nothing is entered', () => {
    expect(exportSheets(v, emptyInfo(3)).map((s) => s.name)).not.toContain('문항정보별')
  })
})

const root = path.resolve(__dirname, '..', 'sample_data')
describe.skipIf(!fs.existsSync(root))('item analysis on NEIS samples', () => {
  it('runs on the 정기고사 sample', () => {
    const files = fs.readdirSync(root).filter((f) => f.endsWith('.xlsx')).map((f) => ({ fileName: f, grid: readGrid(fs.readFileSync(path.join(root, f))) }))
    const a = importFiles(files).assessment!
    const s = itemStats(a.students, a.items, a.classNos)
    expect(s).toHaveLength(24)
    for (const it of s) {
      expect(it.rate).toBeGreaterThanOrEqual(0)
      expect(it.rate).toBeLessThanOrEqual(1)
      expect(it.choices.reduce((x, c) => x + c.share, 0)).toBeCloseTo(1)
      expect(it.discrimination).not.toBeNull()
    }
  })
})
