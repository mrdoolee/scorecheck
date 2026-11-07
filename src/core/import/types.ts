// Shared data model for imported NEIS files. See 설계_청사진.md section 9.

export type Cell = string | number | boolean | null | undefined
export type SheetGrid = Cell[][]

export type ProfileId = 'regular-exam' | 'performance'

/** Kind of a single input file, decided from its content (never from the file name). */
export type FileKind =
  | 'answer-sheet' // 정기시험교과목별 학생답 정오표 (per class)
  | 'grade-summary' // 정기시험 교과목별 일람표 (whole grade)
  | 'performance-class' // 수행평가 강의실별 일람표 (per class)

export interface ExamMeta {
  schoolYear?: number
  semester?: number
  grade?: number
  /** Class number for per-class files. */
  classNo?: number
  /** "반" or "강의실", whichever the file uses. */
  unitLabel?: '반' | '강의실'
  examName?: string
  subject?: string
  teachers?: string
  fullScore?: number
}

export interface Area {
  id: string
  name: string
  maxScore: number | null
  weightPct: number | null
  isTotal: boolean
}

export interface Item {
  no: number
  answer: string
  points: number | null
}

export interface StudentRecord {
  /** `${classNo}-${number}` — unique inside one work. */
  key: string
  classNo: number
  number: number
  studentNo: string
  name: string
  /** Area id -> score. null when the cell is empty or holds text. */
  scores: Record<string, number | null>
  /** Text found instead of a score, e.g. "전출". */
  specialStatus?: string
  /** Regular exam only: per-item marks as printed ('.', '3', 'A', '-'). */
  responses?: string[]
  /** Regular exam only. */
  subscores?: { mc: number | null; sub: number | null; etc: number | null }
}

/** Totals printed at the bottom of NEIS sheets, per area id. */
export interface PrintedSummary {
  count: Record<string, number>
  total: Record<string, number>
  average: Record<string, number>
}

export interface ParsedFile {
  kind: FileKind
  fileName: string
  meta: ExamMeta
}

export interface AnswerSheetFile extends ParsedFile {
  kind: 'answer-sheet'
  items: Item[]
  students: StudentRecord[]
}

export interface GradeSummaryFile extends ParsedFile {
  kind: 'grade-summary'
  classNos: number[]
  /** classNo -> number -> score */
  scores: Map<number, Map<number, number>>
  /** classNo -> printed count/total/average */
  printed: Map<number, { count: number | null; total: number | null; average: number | null }>
}

export interface PerformanceClassFile extends ParsedFile {
  kind: 'performance-class'
  areas: Area[]
  students: StudentRecord[]
  printed: PrintedSummary
}

export type AnyParsedFile = AnswerSheetFile | GradeSummaryFile | PerformanceClassFile

export type IssueLevel = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  level: IssueLevel
  code: string
  message: string
  classNo?: number
  studentKey?: string
}
