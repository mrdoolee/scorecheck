import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { importFiles, type InputFile } from '../src/core/import/assemble'
import { detectKind } from '../src/core/import/detect'
import { readGrid } from '../src/core/import/xlsx'
import { round } from '../src/core/stats/stats'

// Real NEIS samples live in sample_data/ (gitignored, contains real names). Skip when absent.
const root = path.resolve(__dirname, '..', 'sample_data')
const has = fs.existsSync(root)
const load = (dir: string): InputFile[] =>
  // ~$ files are Excel lock files of workbooks that are open right now, not NEIS files.
  fs.readdirSync(dir).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$')).map((f) => ({ fileName: f, grid: readGrid(fs.readFileSync(path.join(dir, f))) }))

describe.skipIf(!has)('정기고사 samples', () => {
  const files = has ? load(root) : []

  it('detects every file kind', () => {
    const kinds = files.map((f) => detectKind(f.grid))
    expect(kinds.filter((k) => k === 'answer-sheet')).toHaveLength(7)
    expect(kinds.filter((k) => k === 'grade-summary')).toHaveLength(1)
  })

  it('imports without errors and matches NEIS figures', () => {
    const { assessment: a, issues, rejected } = importFiles(files)
    expect(rejected).toEqual([])
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    expect(a!.profile).toBe('regular-exam')
    expect(a!.meta).toMatchObject({ schoolYear: 2026, semester: 2, grade: 2, subject: '과학', examName: '3회고사', fullScore: 100 })
    expect(a!.items).toHaveLength(24)
    expect(a!.students).toHaveLength(197)
    expect(a!.classNos).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(a!.gradeCoverage.wholeGrade).toBe(true)
    expect(round(a!.gradeStats.total!.mean!, 1)).toBe(50.7)
    expect(round(a!.classStats[1]!.total!.mean!, 1)).toBe(50.3)
    const s = a!.students.find((x) => x.key === '1-1')!
    // Shape only: this repository is public, so no real student's number, name, score or answers appear here.
    expect(s.studentNo).toMatch(/^20\d{8}$/)
    expect(s.name).toMatch(/^[가-힣]{2,5}$/)
    expect(typeof s.scores.total).toBe('number')
    expect(s.responses).toHaveLength(24)
    expect(s.responses!.every((r) => /^[.1-5]$/.test(r))).toBe(true)
    // 5반 25번은 결번
    expect(a!.students.some((x) => x.key === '5-25')).toBe(false)
    expect(a!.students.some((x) => x.key === '5-29')).toBe(true)
  })
})

describe.skipIf(!has)('수행평가 samples', () => {
  const files = has ? load(path.join(root, 'suhaeng')) : []

  it('imports, parses areas, and handles 전출', () => {
    const { assessment: a, issues, rejected } = importFiles(files)
    expect(rejected).toEqual([])
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    expect(a!.profile).toBe('performance')
    expect(a!.areas.map((x) => [x.name, x.maxScore, x.weightPct])).toEqual([
      ['암석의 관찰과 분류', 10, 10],
      ['혼합물의 분리 실험 설계', 10, 10],
      ['광합성 식물의 호흡 영양소 검출방법', 20, 20],
      ['합계', 40, null]
    ])
    const left = a!.students.find((x) => x.key === '5-25')!
    expect(left.specialStatus).toBe('전출')
    expect(left.signRequired).toBe(false)
    expect(a!.gradeStats.total!.count).toBe(196)
    expect(round(a!.gradeStats.total!.mean!, 2)).toBe(28.38)
    expect(round(a!.gradeStats.area1!.mean!, 2)).toBe(7.67)
    expect(a!.gradeCoverage.wholeGrade).toBeNull()
    expect(issues.some((i) => i.code === 'SPECIAL_STATUS' && i.studentKey === '5-25')).toBe(true)
  })

  it('refuses to mix profiles', () => {
    const regular = load(root)
    const { assessment, issues } = importFiles([...regular, ...files])
    expect(assessment).toBeNull()
    expect(issues[0]!.code).toBe('MIXED_PROFILES')
  })
})
