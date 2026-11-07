// 문항정보 (item information) entered by the teacher. Schools use different 문항정보표 forms, so the app
// does not read the form file. The teacher pastes one column at a time: one line = one item.
// Entering it is optional; every screen must work without it.

export type InfoField = 'area' | 'standard'

export interface ItemInfoRow {
  /** 내용영역 */
  area: string
  /** 성취기준, as pasted (e.g. "[9과08-01] 물질의 특성의 …" or just "[9과08-01]"). */
  standard: string
}

export interface ItemInfo {
  rows: ItemInfoRow[]
  updatedAt: string
}

export const FIELD_LABEL: Record<InfoField, string> = { area: '내용영역', standard: '성취기준' }

const CODE = /^\s*(\[[^\]\n]{2,30}\])/

/** Achievement-standard code at the start of a 성취기준 cell, e.g. "[9과08-01]". */
export function standardCode(s: string): string | null {
  return CODE.exec(s)?.[1]?.replace(/\s+/g, '') ?? null
}

export interface ColumnParse {
  /** Exactly `itemCount` values (missing lines become ''). */
  values: string[]
  lineCount: number
  warnings: string[]
}

/**
 * Splits pasted text into lines. Blank lines stay (a blank line = a blank item, so line N is always item N);
 * only trailing blank lines are dropped.
 */
function lines(text: string): string[] {
  const out = text.replace(/\r\n?/g, '\n').split('\n')
  while (out.length && out[out.length - 1]!.trim() === '') out.pop()
  return out
}

const HANGUL = /[가-힣]/

/**
 * Joins a line that wrapped in the source. Korean forms usually wrap inside a word ("녹" + "는점"), and a break at
 * a space keeps the space at the end of the upper line ("활용 " + "방안"), so: trailing space → one space,
 * Hangul on both sides → no space, otherwise one space.
 */
export function joinWrapped(upper: string, lower: string): string {
  const b = lower.trim()
  if (/\s$/.test(upper)) return `${upper.trimEnd()} ${b}`
  const a = upper.trimEnd()
  return HANGUL.test(a.slice(-1)) && HANGUL.test(b.charAt(0)) ? a + b : `${a} ${b}`
}

/**
 * Parses one pasted column for `itemCount` items.
 * 성취기준: when the column starts with a code like "[9과08-01]", a line without a code is joined to the line
 * above (a long sentence copied from a PDF often wraps onto two lines).
 */
export function parseColumn(field: InfoField, text: string, itemCount: number): ColumnParse {
  let ls = lines(text)
  const warnings: string[] = []

  if (field === 'standard' && ls.length && standardCode(ls[0]!)) {
    const merged: string[] = []
    for (const l of ls) {
      if (merged.length && l.trim() && !standardCode(l)) merged[merged.length - 1] = joinWrapped(merged[merged.length - 1]!, l)
      else merged.push(l)
    }
    if (merged.length !== ls.length) warnings.push(`코드 없이 시작하는 줄 ${ls.length - merged.length}개를 윗줄 문장에 이어 붙였습니다.`)
    ls = merged
  }

  let values = ls.map((l) => l.replace(/\t+/g, ' ').trim())

  const lineCount = values.length
  if (lineCount > itemCount) warnings.push(`${lineCount}줄을 붙여 넣었습니다. 문항이 ${itemCount}개라 앞의 ${itemCount}줄만 씁니다.`)
  else if (lineCount < itemCount && lineCount > 0) warnings.push(`${lineCount}줄을 붙여 넣었습니다. 문항은 ${itemCount}개라 ${lineCount + 1}번부터는 비어 있습니다.`)
  values = Array.from({ length: itemCount }, (_, i) => values[i] ?? '')
  return { values, lineCount, warnings }
}

export function emptyInfo(itemCount: number): ItemInfo {
  return { rows: Array.from({ length: itemCount }, () => ({ area: '', standard: '' })), updatedAt: '' }
}

/** Puts one parsed column into the rows. */
export function applyColumn(info: ItemInfo, field: InfoField, values: string[]): ItemInfo {
  const rows = info.rows.map((r, i) => ({ ...r, [field]: values[i] ?? '' }))
  return { ...info, rows }
}

/** The column as text, one item per line (for showing what is stored back in the text box). */
export function columnText(info: ItemInfo, field: InfoField): string {
  return info.rows.map((r) => r[field]).join('\n')
}

export function hasAnyInfo(info: ItemInfo | null | undefined): boolean {
  return !!info && info.rows.some((r) => r.area.trim() || r.standard.trim())
}

/** Validates data coming over IPC or from disk. Returns a clean copy, or null. */
export function sanitizeInfo(x: unknown, itemCount: number): ItemInfo | null {
  if (!x || typeof x !== 'object') return null
  const rows = (x as { rows?: unknown }).rows
  if (!Array.isArray(rows) || rows.length !== itemCount) return null
  const clip = (v: unknown) => (typeof v === 'string' ? v.slice(0, 500) : '')
  return {
    rows: rows.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>
      return { area: clip(o['area']), standard: clip(o['standard']) }
    }),
    updatedAt: typeof (x as { updatedAt?: unknown }).updatedAt === 'string' ? (x as { updatedAt: string }).updatedAt : ''
  }
}

export interface InfoGroup {
  key: string
  label: string
  /** Item indexes (0-based) in this group. */
  items: number[]
}

/**
 * Groups items by a field. 성취기준 groups by code when there is one, and labels the group with the longest
 * text pasted for that code (later rows often hold only the code). Items with an empty value are left out.
 */
export function groupBy(info: ItemInfo, field: InfoField): InfoGroup[] {
  const map = new Map<string, InfoGroup>()
  info.rows.forEach((r, i) => {
    const raw = r[field].trim()
    if (!raw) return
    const key = field === 'standard' ? (standardCode(raw) ?? raw) : raw
    const g = map.get(key) ?? { key, label: raw, items: [] }
    if (raw.length > g.label.length) g.label = raw
    g.items.push(i)
    map.set(key, g)
  })
  return [...map.values()]
}
