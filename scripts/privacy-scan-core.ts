// Pure helpers for scripts/privacy-scan.ts: what counts as a hit and how it is printed (always masked).

export type TermKind = 'name' | 'teacher' | 'studentNo' | 'school'

export interface Term {
  kind: TermKind
  value: string
}

export interface Hit {
  line: number // 1-based
  term: Term
}

const SCHOOL_SUFFIX = /(중학교|고등학교|초등학교|학교)$/

/** Never print a real value: names keep the first and last syllable, numbers the first 4 digits. */
export function maskTerm(t: Term): string {
  const v = t.value
  if (t.kind === 'studentNo') return v.slice(0, 4) + '*'.repeat(Math.max(0, v.length - 4))
  if (t.kind === 'school') {
    const suffix = SCHOOL_SUFFIX.exec(v)?.[1] ?? ''
    return `${v[0]}○${suffix}`
  }
  if (v.length <= 2) return `${v[0]}○`
  return v[0] + '○'.repeat(v.length - 2) + v[v.length - 1]
}

/** A student number as written in text: plain, and the float form NEIS exports (2026990123 → 2.026990123E9). */
export function studentNoVariants(no: string): string[] {
  return no.length > 1 ? [no, `${no[0]}.${no.slice(1)}E${no.length - 1}`] : [no]
}

function occurs(line: string, t: Term): boolean {
  if (t.kind !== 'studentNo') return line.includes(t.value)
  // A student number counts only when it is not part of a longer number.
  let i = line.indexOf(t.value)
  while (i !== -1) {
    const before = line[i - 1] ?? '', after = line[i + t.value.length] ?? ''
    if (!/\d/.test(before) && !/\d/.test(after)) return true
    i = line.indexOf(t.value, i + 1)
  }
  return false
}

/** Every (line, term) pair where the term appears, in line order then term order. */
export function scanText(text: string, terms: Term[]): Hit[] {
  const hits: Hit[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    for (const term of terms) if (occurs(line, term)) hits.push({ line: i + 1, term })
  })
  return hits
}
