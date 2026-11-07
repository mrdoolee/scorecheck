// Statistics shown to students and teachers. Rank / percentile are intentionally not implemented
// (they must never be exposed to students — see 설계_청사진.md 8.2).

export interface Summary {
  count: number
  total: number
  mean: number | null
  /** Population standard deviation: sqrt(sum((x - mean)^2) / N). */
  sd: number | null
  min: number | null
  max: number | null
}

export function summarize(values: readonly number[]): Summary {
  const n = values.length
  if (n === 0) return { count: 0, total: 0, mean: null, sd: null, min: null, max: null }
  const total = values.reduce((s, v) => s + v, 0)
  const mean = total / n
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  return { count: n, total, mean, sd, min: Math.min(...values), max: Math.max(...values) }
}

/** Rounds to `digits` decimals the way NEIS prints averages (half away from zero). */
export function round(value: number, digits = 1): number {
  const f = 10 ** digits
  return Math.sign(value) * Math.round(Math.abs(value) * f + 1e-9) / f
}
