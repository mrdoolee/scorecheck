// Short rule-based feedback for the student screen. Runs locally; no AI service.
// Never mentions rank, percentile, or other students' results.
import type { Item, ProfileId, StudentRecord } from '../import/types'
import type { Comparison } from '../stats/display'
import { groupBy, type ItemInfo } from '../item-analysis/info'

export interface FeedbackOptions {
  /** Items at or above this grade-wide correct rate count as "많은 친구가 맞힌 문항". */
  easyItemRate: number
  maxItemsListed: number
}

export const DEFAULT_FEEDBACK: FeedbackOptions = { easyItemRate: 0.7, maxItemsListed: 3 }

function diffSentence(label: string, diff: number | null): string | null {
  if (diff === null) return null
  if (diff > 0) return `${label}보다 ${diff.toFixed(1)}점 높아요.`
  if (diff < 0) return `${label}보다 ${Math.abs(diff).toFixed(1)}점 낮아요.`
  return `${label}과 같아요.`
}

export function feedbackFor(
  profile: ProfileId,
  s: StudentRecord,
  comparisons: Comparison[],
  items: Item[],
  correctRates: number[],
  opt: FeedbackOptions = DEFAULT_FEEDBACK,
  info: ItemInfo | null = null,
  /** Same label as the student screen, e.g. "학년 평균" or "학년 평균(2개 반 기준)" when only some classes were imported. */
  gradeLabel = '학년 평균'
): string[] {
  if (s.specialStatus) return []
  const lines: string[] = []
  const total = comparisons.find((c) => c.areaId === 'total')

  if (profile === 'regular-exam') {
    const responses = s.responses ?? []
    const wrong = responses.map((r, i) => (r !== '.' ? i : -1)).filter((i) => i >= 0)
    if (responses.length && wrong.length === 0) lines.push('모든 문항을 맞혔어요.')
    const totalLine = diffSentence(gradeLabel, total?.diffGrade ?? null)
    if (totalLine) lines.push(totalLine)
    const easyMissed = wrong
      .filter((i) => (correctRates[i] ?? 0) >= opt.easyItemRate)
      .sort((a, b) => (correctRates[b] ?? 0) - (correctRates[a] ?? 0))
      .slice(0, opt.maxItemsListed)
      .sort((a, b) => a - b)
    if (easyMissed.length) {
      const nos = easyMissed.map((i) => `${items[i]?.no ?? i + 1}번`).join(', ')
      lines.push(`많은 친구가 맞힌 ${nos} 문항부터 다시 확인해 보세요.`)
    } else if (wrong.length) {
      lines.push(`틀린 ${wrong.length}문항을 다시 풀어 보세요.`)
    }
    const weak = info ? weakestArea(responses, items, correctRates, info) : null
    if (weak) lines.push(`'${weak}' 영역을 복습하면 도움이 돼요.`)
    return lines
  }

  // performance
  const parts = comparisons.filter((c) => c.areaId !== 'total' && c.score !== null && c.maxScore)
  const ratio = (c: Comparison) => (c.score as number) / (c.maxScore as number)
  if (parts.length && parts.every((c) => ratio(c) === 1)) {
    lines.push('모든 영역에서 만점을 받았어요.')
  } else if (parts.length > 1) {
    const sorted = [...parts].sort((a, b) => ratio(b) - ratio(a))
    const best = sorted[0]!
    const worst = sorted[sorted.length - 1]!
    if (ratio(best) > ratio(worst)) {
      lines.push(`'${best.areaName}'에서 특히 잘했어요.`)
      lines.push(`'${worst.areaName}'을(를) 보완하면 좋아요.`)
    }
  }
  const totalLine = diffSentence(`합계는 ${gradeLabel}`, total?.diffGrade ?? null)
  if (totalLine) lines.push(totalLine)
  return lines
}

/**
 * 내용영역 where this student's score rate is lowest (points-weighted). Ties go to the area where the student
 * lost more points, then to the one furthest below the grade-wide rate. Null when there is no 문항정보 or the student missed nothing.
 */
export function weakestArea(responses: string[], items: Item[], correctRates: number[], info: ItemInfo): string | null {
  if (!responses.length) return null
  const w = (i: number) => (items[i]?.points != null && items[i]!.points! > 0 ? items[i]!.points! : 1)
  let best: { label: string; rate: number; lost: number; gap: number } | null = null
  for (const g of groupBy(info, 'area')) {
    const possible = g.items.reduce((s, i) => s + w(i), 0)
    if (!possible) continue
    const mine = g.items.reduce((s, i) => s + (responses[i] === '.' ? w(i) : 0), 0) / possible
    if (mine >= 1) continue
    const grade = g.items.reduce((s, i) => s + (correctRates[i] ?? 0) * w(i), 0) / possible
    const gap = mine - grade
    const lost = possible * (1 - mine)
    const eq = (x: number, y: number) => Math.abs(x - y) < 1e-9
    const better =
      !best || mine < best.rate - 1e-9 || (eq(mine, best.rate) && (lost > best.lost + 1e-9 || (eq(lost, best.lost) && gap < best.gap)))
    if (better) best = { label: g.label, rate: mine, lost, gap }
  }
  return best?.label ?? null
}

/** NEIS multi-answer codes: A=1,2 … J=4,5, K=1,2,3 … Z=1,2,3,4,5 (as printed in the 정오표 legend). */
export const MULTI_ANSWER: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  const combos: number[][] = []
  for (let size = 2; size <= 5; size++) {
    const walk = (start: number, acc: number[]) => {
      if (acc.length === size) return void combos.push([...acc])
      for (let v = start; v <= 5; v++) walk(v + 1, [...acc, v])
    }
    walk(1, [])
  }
  combos.forEach((c, i) => (out[String.fromCharCode(65 + i)] = c.join(',')))
  return out
})()

/** Human-readable answer for a 정오표 mark. */
export function describeMark(mark: string, correct: string): { ok: boolean; mine: string } {
  if (mark === '.') return { ok: true, mine: correct }
  if (mark === '-' || mark === '') return { ok: false, mine: '무응답' }
  if (/^[A-Z]$/.test(mark)) return { ok: false, mine: MULTI_ANSWER[mark] ?? mark }
  return { ok: false, mine: mark }
}
