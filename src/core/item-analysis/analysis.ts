// Teacher-only item analysis (설계_청사진.md 11장). Pure functions, no rank or percentile output:
// the upper/lower groups used for discrimination stay inside this module and are never listed per student.
import type { Area, Item, StudentRecord } from '../import/types'
import { MULTI_ANSWER } from '../feedback/feedback'
import { summarize, type Summary } from '../stats/stats'
import { groupBy, type InfoField, type ItemInfo } from './info'

export const UPPER_LOWER_SHARE = 0.27
/** Discrimination below this is flagged as low. */
export const LOW_DISCRIMINATION = 0.2
/** A wrong option chosen by at least this share (or more often than the answer) is flagged as attractive. */
export const ATTRACTIVE_SHARE = 0.2

export interface FullSummary extends Summary {
  median: number | null
}

export function fullSummary(values: readonly number[]): FullSummary {
  const s = summarize(values)
  if (!values.length) return { ...s, median: null }
  const v = [...values].sort((a, b) => a - b)
  const m = v.length >> 1
  return { ...s, median: v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2 }
}

export interface Bin {
  from: number
  to: number
  count: number
}

/** Equal-width bins from 0 to `max`; the last bin includes `max`. */
export function histogram(values: readonly number[], max: number, bins = 10): Bin[] {
  const top = max > 0 ? max : Math.max(1, ...values)
  const w = top / bins
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({ from: i * w, to: (i + 1) * w, count: 0 }))
  for (const x of values) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor(x / w)))
    out[i]!.count++
  }
  return out
}

// ---------------------------------------------------------------- 정기고사

/** Students who sat the exam: they have per-item marks and a numeric total. */
export function examTakers(students: StudentRecord[]): StudentRecord[] {
  return students.filter((s) => s.responses && typeof s.scores['total'] === 'number')
}

/** What the student chose on an item: the option text, '무응답', or the option set for multiple marks. */
export function choiceOf(mark: string, answer: string): { key: string; kind: 'option' | 'none' | 'multi' } {
  if (mark === '.') return { key: answer, kind: /^\d+$/.test(answer) ? 'option' : 'multi' }
  if (mark === '-' || mark === '') return { key: '무응답', kind: 'none' }
  if (/^[A-Z]$/.test(mark)) return { key: MULTI_ANSWER[mark] ?? mark, kind: 'multi' }
  return { key: mark, kind: 'option' }
}

export interface ChoiceShare {
  key: string
  label: string
  count: number
  share: number
  correct: boolean
  attractive: boolean
}

export interface ItemStat {
  index: number
  no: number
  answer: string
  points: number | null
  rate: number
  classRates: Record<number, number>
  choices: ChoiceShare[]
  noAnswerShare: number
  multiShare: number
  upperRate: number
  lowerRate: number
  /** upperRate − lowerRate; null when there are too few takers to form two groups. */
  discrimination: number | null
}

function upperLower(takers: StudentRecord[]) {
  const n = Math.round(takers.length * UPPER_LOWER_SHARE)
  if (n < 1 || takers.length < 2 * n) return null
  const sorted = [...takers].sort((a, b) => (b.scores['total'] as number) - (a.scores['total'] as number))
  return { upper: sorted.slice(0, n), lower: sorted.slice(-n) }
}

const rateOf = (group: StudentRecord[], i: number) => (group.length ? group.filter((s) => s.responses![i] === '.').length / group.length : 0)

export function itemStats(students: StudentRecord[], items: Item[], classNos: number[]): ItemStat[] {
  const takers = examTakers(students)
  const ul = upperLower(takers)
  const maxOption = Math.max(5, ...items.map((it) => Number(it.answer) || 0), ...takers.flatMap((s) => s.responses!.map((m) => (/^\d+$/.test(m) ? Number(m) : 0))))
  return items.map((it, i) => {
    const counts = new Map<string, number>()
    let none = 0
    let multi = 0
    for (const s of takers) {
      const c = choiceOf(s.responses![i] ?? '', it.answer)
      if (c.kind === 'none') none++
      else if (c.kind === 'multi' && s.responses![i] !== '.') multi++
      counts.set(c.key, (counts.get(c.key) ?? 0) + 1)
    }
    const n = takers.length || 1
    const options = Array.from({ length: maxOption }, (_, k) => String(k + 1))
    const extra = [...counts.keys()].filter((k) => !options.includes(k) && k !== '무응답')
    const keys = [...options, ...extra, '무응답']
    const correctShare = (counts.get(it.answer) ?? 0) / n
    const choices = keys.map((key) => {
      const count = counts.get(key) ?? 0
      const share = count / n
      const correct = key === it.answer
      return {
        key,
        label: key === '무응답' ? '무응답' : extra.includes(key) ? `복수 ${key}` : `${key}번`,
        count,
        share,
        correct,
        attractive: !correct && key !== '무응답' && count > 0 && (share >= ATTRACTIVE_SHARE || share > correctShare)
      }
    })
    const classRates: Record<number, number> = {}
    for (const c of classNos) classRates[c] = rateOf(takers.filter((s) => s.classNo === c), i)
    const upperRate = ul ? rateOf(ul.upper, i) : 0
    const lowerRate = ul ? rateOf(ul.lower, i) : 0
    return {
      index: i,
      no: it.no,
      answer: it.answer,
      points: it.points,
      rate: rateOf(takers, i),
      classRates,
      choices,
      noAnswerShare: none / n,
      multiShare: multi / n,
      upperRate,
      lowerRate,
      discrimination: ul ? upperRate - lowerRate : null
    }
  })
}

export interface ClassRow {
  classNo: number
  summary: FullSummary
}

export function classRows(students: StudentRecord[], classNos: number[], areaId: string): ClassRow[] {
  return classNos.map((c) => ({
    classNo: c,
    summary: fullSummary(students.filter((s) => s.classNo === c).map((s) => s.scores[areaId]).filter((v): v is number => typeof v === 'number'))
  }))
}

export interface GroupStat {
  key: string
  label: string
  items: number[]
  /** Sum of item points (item count when points are missing). */
  points: number
  /** Points earned ÷ points possible over all takers (0..1). */
  scoreRate: number
  classRates: Record<number, number>
}

const weight = (it: Item | undefined) => (it?.points != null && it.points > 0 ? it.points : 1)

/** Score rate of one student (or many) over a set of items, weighted by points. */
export function groupRate(group: StudentRecord[], items: Item[], idx: number[]): number {
  const possible = idx.reduce((s, i) => s + weight(items[i]), 0) * group.length
  if (!possible) return 0
  let earned = 0
  for (const s of group) for (const i of idx) if (s.responses![i] === '.') earned += weight(items[i])
  return earned / possible
}

export function infoGroupStats(students: StudentRecord[], items: Item[], classNos: number[], info: ItemInfo, field: InfoField): GroupStat[] {
  const takers = examTakers(students)
  return groupBy(info, field).map((g) => {
    const classRates: Record<number, number> = {}
    for (const c of classNos) classRates[c] = groupRate(takers.filter((s) => s.classNo === c), items, g.items)
    return {
      key: g.key,
      label: g.label,
      items: g.items,
      points: g.items.reduce((s, i) => s + weight(items[i]), 0),
      scoreRate: groupRate(takers, items, g.items),
      classRates
    }
  })
}

// ---------------------------------------------------------------- 수행평가

export interface AreaStat {
  area: Area
  summary: FullSummary
  fullCount: number
  zeroCount: number
  bins: Bin[]
  classMeans: Record<number, number | null>
}

export function areaStats(students: StudentRecord[], areas: Area[], classNos: number[]): AreaStat[] {
  return areas.map((a) => {
    const vals = students.map((s) => s.scores[a.id]).filter((v): v is number => typeof v === 'number')
    const max = a.maxScore ?? Math.max(1, ...vals)
    const classMeans: Record<number, number | null> = {}
    for (const c of classNos)
      classMeans[c] = summarize(students.filter((s) => s.classNo === c).map((s) => s.scores[a.id]).filter((v): v is number => typeof v === 'number')).mean
    return {
      area: a,
      summary: fullSummary(vals),
      fullCount: a.maxScore != null ? vals.filter((v) => v >= a.maxScore!).length : 0,
      zeroCount: vals.filter((v) => v === 0).length,
      bins: histogram(vals, max, Math.min(10, Math.max(4, Math.ceil(max)))),
      classMeans
    }
  })
}
