import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { importFiles } from '../src/core/import/assemble'
import { readGrid } from '../src/core/import/xlsx'
import { compare, itemCorrectRates, neisTotalAverage } from '../src/core/stats/display'
import { describeMark, feedbackFor, MULTI_ANSWER } from '../src/core/feedback/feedback'

const root = path.resolve(__dirname, '..', 'sample_data')
const has = fs.existsSync(root)
const load = (dir: string) =>
  fs.readdirSync(dir).filter((f) => f.endsWith('.xlsx')).map((f) => ({ fileName: f, grid: readGrid(fs.readFileSync(path.join(dir, f))) }))

describe('codes and rules', () => {
  it('maps multi-answer codes like the NEIS legend', () => {
    expect(MULTI_ANSWER['A']).toBe('1,2')
    expect(MULTI_ANSWER['J']).toBe('4,5')
    expect(MULTI_ANSWER['K']).toBe('1,2,3')
    expect(MULTI_ANSWER['Z']).toBe('1,2,3,4,5')
    expect(describeMark('C', '3')).toEqual({ ok: false, mine: '1,4' })
    expect(describeMark('.', '3')).toEqual({ ok: true, mine: '3' })
  })
  it('reproduces NEIS 합계 averages', () => {
    expect(neisTotalAverage([202 / 28, 180 / 28, 398 / 28])).toBe(27.8)
    expect(neisTotalAverage([215 / 27, 169 / 27, 379 / 27])).toBe(28.2)
  })
})

describe.skipIf(!has)('student comparisons', () => {
  it('regular exam: class average matches printed 일람표, feedback has no rank', () => {
    const a = importFiles(load(root)).assessment!
    const s = a.students.find((x) => x.key === '1-1')!
    const c = compare(a, s)
    expect(c[0]!.classMean).toBe(50.3)
    expect(c[0]!.gradeMean).toBe(50.7)
    expect(c[0]!.diffClass).toBe(-5.7)
    const rates = itemCorrectRates(a.students, a.items.length)
    const fb = feedbackFor(a.profile, s, c, a.items, rates)
    expect(fb.join(' ')).toMatch(/학년 평균보다 6\.1점 낮아요/)
    expect(fb.join(' ')).not.toMatch(/등|석차|백분위|%/)
  })
  it('performance: total class average follows NEIS rule', () => {
    const a = importFiles(load(path.join(root, 'suhaeng'))).assessment!
    const s = a.students.find((x) => x.key === '2-1')!
    const total = compare(a, s).find((x) => x.areaId === 'total')!
    expect(total.classMean).toBe(27.8)
    const left = a.students.find((x) => x.key === '5-25')!
    expect(feedbackFor(a.profile, left, compare(a, left), [], [])).toEqual([])
  })
})
