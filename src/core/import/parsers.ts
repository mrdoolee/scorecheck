import { classNumberOf, findCell, headText, num, parseMeta, str, studentNoOf } from './grid'
import type {
  AnswerSheetFile,
  Area,
  Cell,
  GradeSummaryFile,
  Item,
  PerformanceClassFile,
  PrintedSummary,
  SheetGrid,
  StudentRecord
} from './types'

const SUMMARY_LABELS: Record<string, keyof PrintedSummary> = { 응시생수: 'count', 총점: 'total', 평균: 'average' }

function summaryLabel(row: Cell[] | undefined): keyof PrintedSummary | null {
  if (!row) return null
  for (let c = 0; c < Math.min(3, row.length); c++) {
    const key = SUMMARY_LABELS[str(row[c]).replace(/\s/g, '')]
    if (key) return key
  }
  return null
}

/** Mark as printed by NEIS: numbers come back as floats (5 -> 5.0), so normalise to "5". */
function mark(c: Cell): string {
  if (typeof c === 'number') return Number.isInteger(c) ? String(c) : String(c)
  return str(c)
}

/** Name column: the text cell in the first 5 columns that is neither 반/번호 nor 학번. */
function nameOf(row: Cell[], skip: number[]): string {
  for (let c = 0; c < Math.min(5, row.length); c++) {
    if (skip.includes(c)) continue
    const s = str(row[c])
    if (s && typeof row[c] === 'string' && !/^\d+\s*\/\s*\d+$/.test(s)) return s
  }
  return ''
}

function baseStudent(row: Cell[]): Omit<StudentRecord, 'scores'> | null {
  const cn = classNumberOf(row)
  if (!cn) return null
  const sno = studentNoOf(row)
  return {
    key: `${cn.classNo}-${cn.number}`,
    classNo: cn.classNo,
    number: cn.number,
    studentNo: sno?.value ?? '',
    name: nameOf(row, [cn.col, sno?.col ?? -1])
  }
}

// ---------------------------------------------------------------- 정오표

export function parseAnswerSheet(grid: SheetGrid, fileName: string): AnswerSheetFile {
  const header = findCell(grid, (s) => s === '반/번호')
  if (!header) throw new Error('정오표 헤더(반/번호)를 찾지 못했습니다.')
  const h = header.row
  const headRow = grid[h] ?? []
  const answerRow = grid[h + 1] ?? []
  const pointsRow = grid[h + 2] ?? []

  const scoreCol = { mc: -1, sub: -1, etc: -1, tot: -1 }
  const items: Item[] = []
  const itemCols: number[] = []
  for (let c = header.col + 1; c < headRow.length; c++) {
    const label = str(headRow[c])
    if (/선택|선다/.test(label)) scoreCol.mc = c
    else if (/서답|서술/.test(label)) scoreCol.sub = c
    else if (/기타/.test(label)) scoreCol.etc = c
    else if (/총점/.test(label)) scoreCol.tot = c
    else if (scoreCol.mc < 0 && scoreCol.tot < 0 && num(headRow[c]) !== null && str(answerRow[c]) !== '') {
      items.push({ no: num(headRow[c])!, answer: mark(answerRow[c]), points: num(pointsRow[c]) })
      itemCols.push(c)
    }
  }
  if (scoreCol.tot < 0) throw new Error('정오표에서 영역총점 열을 찾지 못했습니다.')

  const students: StudentRecord[] = []
  for (let r = h + 3; r < grid.length; r++) {
    const row = grid[r] ?? []
    if (str(row[0]).startsWith('※')) break
    const base = baseStudent(row)
    if (!base) continue
    const total = num(row[scoreCol.tot])
    const totText = str(row[scoreCol.tot])
    const rec: StudentRecord = {
      ...base,
      scores: { total },
      responses: itemCols.map((c) => mark(row[c])),
      subscores: {
        mc: scoreCol.mc >= 0 ? num(row[scoreCol.mc]) : null,
        sub: scoreCol.sub >= 0 ? num(row[scoreCol.sub]) : null,
        etc: scoreCol.etc >= 0 ? num(row[scoreCol.etc]) : null
      }
    }
    if (total === null && totText) rec.specialStatus = totText
    students.push(rec)
  }

  return { kind: 'answer-sheet', fileName, meta: parseMeta(headText(grid.slice(0, h), h)), items, students }
}

// ---------------------------------------------------------------- 교과목별 일람표 (학년 전체)

export function parseGradeSummary(grid: SheetGrid, fileName: string): GradeSummaryFile {
  const header = findCell(grid, (s) => s.replace(/\s/g, '') === '반번호')
  if (!header) throw new Error('일람표 헤더(반번호)를 찾지 못했습니다.')
  const headRow = grid[header.row] ?? []
  const classCols: { col: number; classNo: number }[] = []
  for (let c = header.col + 1; c < headRow.length; c++) {
    const n = num(headRow[c])
    if (n !== null && Number.isInteger(n)) classCols.push({ col: c, classNo: n })
  }

  const scores = new Map<number, Map<number, number>>(classCols.map((cc) => [cc.classNo, new Map()]))
  const printed = new Map(classCols.map((cc) => [cc.classNo, { count: null as number | null, total: null as number | null, average: null as number | null }]))

  for (let r = header.row + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const label = summaryLabel(row)
    if (label) {
      for (const cc of classCols) printed.get(cc.classNo)![label] = num(row[cc.col])
      continue
    }
    const studentNumber = num(row[header.col])
    if (studentNumber === null || !Number.isInteger(studentNumber)) continue
    for (const cc of classCols) {
      const v = num(row[cc.col])
      if (v !== null) scores.get(cc.classNo)!.set(studentNumber, v)
    }
  }

  return {
    kind: 'grade-summary',
    fileName,
    meta: parseMeta(headText(grid.slice(0, header.row), header.row)),
    classNos: classCols.map((c) => c.classNo),
    scores,
    printed
  }
}

// ---------------------------------------------------------------- 수행평가 강의실별 일람표

const AREA_RE = /^(.*?)\s*\(\s*만점\s*([\d.]+)\s*,\s*([\d.]+)\s*%\s*\)\s*$/s

export function parsePerformanceClass(grid: SheetGrid, fileName: string): PerformanceClassFile {
  const header = findCell(grid, (s) => s === '반/번호')
  if (!header) throw new Error('수행평가 일람표 헤더(반/번호)를 찾지 못했습니다.')
  const headRow = grid[header.row] ?? []
  const nameCol = headRow.findIndex((c) => str(c) === '성명')
  const totalCol = headRow.findIndex((c) => str(c) === '합계')
  if (nameCol < 0 || totalCol < 0 || totalCol <= nameCol + 1) throw new Error('수행평가 영역 열을 찾지 못했습니다.')

  const areaCols: { col: number; area: Area }[] = []
  for (let c = nameCol + 1; c < totalCol; c++) {
    const label = str(headRow[c])
    if (!label) continue
    const m = AREA_RE.exec(label)
    areaCols.push({
      col: c,
      area: {
        id: `area${areaCols.length + 1}`,
        name: (m ? m[1]! : label).replace(/\s+/g, ' ').trim(),
        maxScore: m ? Number(m[2]) : null,
        weightPct: m ? Number(m[3]) : null,
        isTotal: false
      }
    })
  }
  const maxSum = areaCols.every((a) => a.area.maxScore !== null)
    ? areaCols.reduce((s, a) => s + a.area.maxScore!, 0)
    : null
  const areas: Area[] = [
    ...areaCols.map((a) => a.area),
    { id: 'total', name: '합계', maxScore: maxSum, weightPct: null, isTotal: true }
  ]

  const students: StudentRecord[] = []
  const printed: PrintedSummary = { count: {}, total: {}, average: {} }
  const cols = [...areaCols.map((a) => ({ id: a.area.id, col: a.col })), { id: 'total', col: totalCol }]

  for (let r = header.row + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const label = summaryLabel(row)
    if (label) {
      for (const { id, col } of cols) {
        const v = num(row[col])
        if (v !== null) printed[label][id] = v
      }
      continue
    }
    const base = baseStudent(row)
    if (!base) continue
    const scores: Record<string, number | null> = {}
    let special: string | undefined
    for (const { id, col } of cols) {
      const v = num(row[col])
      scores[id] = v
      const text = str(row[col])
      if (v === null && text && !special) special = text
    }
    students.push(special ? { ...base, scores, specialStatus: special } : { ...base, scores })
  }

  return {
    kind: 'performance-class',
    fileName,
    meta: parseMeta(headText(grid.slice(0, header.row), header.row)),
    areas,
    students,
    printed
  }
}
