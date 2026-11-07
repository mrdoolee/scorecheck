// Numbers shown on the student screen. Class averages follow NEIS printing rules so they match the
// official 일람표; grade averages are computed (NEIS prints none). Never computes rank or percentile.
import type { Area, ProfileId, StudentRecord } from '../import/types'
import { round, summarize, type Summary } from './stats'

export interface Comparison {
  areaId: string
  areaName: string
  maxScore: number | null
  score: number | null
  classMean: number | null
  classSd: number | null
  gradeMean: number | null
  gradeSd: number | null
  diffClass: number | null
  diffGrade: number | null
}

export interface StatsInput {
  profile: ProfileId
  areas: Area[]
  classStats: Record<number, Record<string, Summary>>
  gradeStats: Record<string, Summary>
}

/** NEIS 수행평가 합계 average: sum of area means truncated to 2 decimals, rounded to 1 decimal. */
export function neisTotalAverage(areaMeans: (number | null)[]): number | null {
  if (!areaMeans.length || areaMeans.some((m) => m === null)) return null
  const sum = (areaMeans as number[]).reduce((s, m) => s + Math.trunc(m * 100 + 1e-9) / 100, 0)
  return Math.round(sum * 10 + 1e-9) / 10
}

const r1 = (v: number | null | undefined) => (v === null || v === undefined ? null : round(v, 1))

export function compare(input: StatsInput, s: StudentRecord): Comparison[] {
  const cls = input.classStats[s.classNo] ?? {}
  const parts = input.areas.filter((a) => !a.isTotal)
  return input.areas.map((a) => {
    let classMean = r1(cls[a.id]?.mean)
    if (a.isTotal && input.profile === 'performance') classMean = neisTotalAverage(parts.map((p) => cls[p.id]?.mean ?? null))
    const gradeMean = r1(input.gradeStats[a.id]?.mean)
    const score = s.scores[a.id] ?? null
    return {
      areaId: a.id,
      areaName: a.name,
      maxScore: a.maxScore,
      score,
      classMean,
      classSd: r1(cls[a.id]?.sd),
      gradeMean,
      gradeSd: r1(input.gradeStats[a.id]?.sd),
      diffClass: score !== null && classMean !== null ? round(score - classMean, 1) : null,
      diffGrade: score !== null && gradeMean !== null ? round(score - gradeMean, 1) : null
    }
  })
}

/** Per-item correct rate (0..1) over all imported students with a numeric total. */
export function itemCorrectRates(students: StudentRecord[], itemCount: number): number[] {
  const takers = students.filter((s) => s.responses && typeof s.scores['total'] === 'number')
  return Array.from({ length: itemCount }, (_, i) => {
    if (!takers.length) return 0
    return takers.filter((s) => s.responses![i] === '.').length / takers.length
  })
}

export { summarize }
