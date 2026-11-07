import type { Cell, ExamMeta, SheetGrid } from './types'

export function str(c: Cell): string {
  return c == null ? '' : String(c).trim()
}

/** Numeric value of a cell, or null for empty / non-numeric text. Accepts "29 명" style counts. */
export function num(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  const s = str(c).replace(/,/g, '').replace(/\s*명$/, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Text of the first `rows` rows joined, for keyword detection. */
export function headText(grid: SheetGrid, rows = 15): string {
  return grid
    .slice(0, rows)
    .map((r) => (r ?? []).map(str).filter(Boolean).join(' '))
    .join('\n')
}

export function findCell(
  grid: SheetGrid,
  test: (s: string) => boolean,
  maxRows = 15
): { row: number; col: number } | null {
  for (let r = 0; r < Math.min(grid.length, maxRows); r++) {
    const row = grid[r] ?? []
    for (let c = 0; c < row.length; c++) if (test(str(row[c]))) return { row: r, col: c }
  }
  return null
}

const CLASS_NO_RE = /^\s*(\d+)\s*\/\s*(\d+)\s*$/

/** Finds `반/번호` (e.g. "3/12") in the first 5 columns of a row. */
export function classNumberOf(row: Cell[] | undefined): { classNo: number; number: number; col: number } | null {
  if (!row) return null
  for (let c = 0; c < Math.min(5, row.length); c++) {
    const m = CLASS_NO_RE.exec(str(row[c]))
    if (m) return { classNo: Number(m[1]), number: Number(m[2]), col: c }
  }
  return null
}

/** Student ID: a large integer in the first 5 columns (NEIS stores it as a float, e.g. 학번 20YYxxxxxx as 2.0YYxxxxxxE9). */
export function studentNoOf(row: Cell[]): { value: string; col: number } | null {
  for (let c = 0; c < Math.min(5, row.length); c++) {
    const v = row[c]
    const n = typeof v === 'number' ? v : /^\d{6,}$/.test(str(v)) ? Number(str(v)) : NaN
    if (Number.isFinite(n) && n > 99999) return { value: String(Math.round(n)), col: c }
  }
  return null
}

/** Parses year / semester / grade / class / exam / subject from the title lines of a NEIS sheet. */
export function parseMeta(text: string): ExamMeta {
  const meta: ExamMeta = {}
  const flat = text.replace(/\s+/g, ' ')
  let m = /(\d{4})\s*학년도/.exec(flat)
  if (m) meta.schoolYear = Number(m[1])
  m = /(\d)\s*학기/.exec(flat)
  if (m) meta.semester = Number(m[1])
  m = /(\d)\s*학년(?!도)/.exec(flat)
  if (m) meta.grade = Number(m[1])
  m = /학년\s+(\d+)\s*(반|강의실)/.exec(flat)
  if (m) {
    meta.classNo = Number(m[1])
    meta.unitLabel = m[2] as '반' | '강의실'
  }
  m = /고사\s*:\s*(\S+)/.exec(flat) ?? /(?:반|강의실)\s+(\S*고사)/.exec(flat)
  if (m) meta.examName = m[1]
  m = /교과목\s*:\s*(\S+)/.exec(flat) ?? /\S*고사\s+(\S+)/.exec(flat)
  if (m) meta.subject = m[1]
  m = /과목만점\s*:\s*([\d.]+)/.exec(flat)
  if (m) meta.fullScore = Number(m[1])
  m = /교과담당교사\s*:?\s*\(?\s*([^)\n]+?)\s*\)?\s*(?:인\s*)?$/m.exec(text)
  if (m) meta.teachers = m[1]!.trim()
  return meta
}
