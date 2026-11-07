import { summarize, type Summary } from '../stats/stats'
import { detectKind } from './detect'
import { parseAnswerSheet, parseGradeSummary, parsePerformanceClass } from './parsers'
import type {
  AnswerSheetFile,
  AnyParsedFile,
  Area,
  ExamMeta,
  GradeSummaryFile,
  Item,
  PerformanceClassFile,
  ProfileId,
  SheetGrid,
  StudentRecord,
  ValidationIssue
} from './types'
import { validateAssessment } from '../validate/validate'

export interface InputFile {
  fileName: string
  grid: SheetGrid
}

export interface Assessment {
  profile: ProfileId
  meta: ExamMeta
  areas: Area[]
  items: Item[]
  students: (StudentRecord & { signRequired: boolean })[]
  classNos: number[]
  /** classNo -> areaId -> summary */
  classStats: Record<number, Record<string, Summary>>
  /** areaId -> summary over the grade (or over the imported classes, see gradeCoverage). */
  gradeStats: Record<string, Summary>
  gradeCoverage: {
    classNos: number[]
    /** true: taken from a whole-grade file. null: unknown, teacher must confirm. */
    wholeGrade: boolean | null
  }
  files: AnyParsedFile[]
}

export interface ImportResult {
  assessment: Assessment | null
  issues: ValidationIssue[]
  rejected: { fileName: string; reason: string }[]
}

/** Students who left school are excluded from signing by default; other texts are flagged for the teacher. */
export function defaultSignRequired(s: StudentRecord): boolean {
  return !(s.specialStatus && /전출/.test(s.specialStatus))
}

function numericScores(students: StudentRecord[], areaId: string): number[] {
  return students.flatMap((s) => {
    const v = s.scores[areaId]
    return typeof v === 'number' ? [v] : []
  })
}

function statsByArea(students: StudentRecord[], areas: Area[]): Record<string, Summary> {
  return Object.fromEntries(areas.map((a) => [a.id, summarize(numericScores(students, a.id))]))
}

export function importFiles(inputs: InputFile[]): ImportResult {
  const issues: ValidationIssue[] = []
  const rejected: ImportResult['rejected'] = []
  const parsed: AnyParsedFile[] = []

  for (const f of inputs) {
    const kind = detectKind(f.grid)
    if (!kind) {
      rejected.push({ fileName: f.fileName, reason: '지원하지 않는 양식입니다.' })
      continue
    }
    try {
      if (kind === 'answer-sheet') parsed.push(parseAnswerSheet(f.grid, f.fileName))
      else if (kind === 'grade-summary') parsed.push(parseGradeSummary(f.grid, f.fileName))
      else parsed.push(parsePerformanceClass(f.grid, f.fileName))
    } catch (e) {
      rejected.push({ fileName: f.fileName, reason: (e as Error).message })
    }
  }

  const sheets = parsed.filter((p): p is AnswerSheetFile => p.kind === 'answer-sheet')
  const summaries = parsed.filter((p): p is GradeSummaryFile => p.kind === 'grade-summary')
  const perfs = parsed.filter((p): p is PerformanceClassFile => p.kind === 'performance-class')

  if ((sheets.length || summaries.length) && perfs.length) {
    issues.push({ level: 'error', code: 'MIXED_PROFILES', message: '정기고사 파일과 수행평가 파일이 섞여 있습니다. 작업을 나눠서 가져오세요.' })
    return { assessment: null, issues, rejected }
  }
  if (summaries.length > 1) {
    issues.push({ level: 'error', code: 'MULTIPLE_GRADE_SUMMARY', message: '학년 전체 일람표가 2개 이상입니다. 하나만 넣으세요.' })
    return { assessment: null, issues, rejected }
  }

  const classFiles: (AnswerSheetFile | PerformanceClassFile)[] = sheets.length ? sheets : perfs
  if (!classFiles.length) {
    issues.push({ level: 'error', code: 'NO_CLASS_FILE', message: '반별 성적 파일(정오표 또는 수행평가 일람표)이 없습니다.' })
    return { assessment: null, issues, rejected }
  }

  // Duplicate class files
  const seenClass = new Map<number, string>()
  for (const f of classFiles) {
    const classNo = f.students[0]?.classNo ?? f.meta.classNo
    if (classNo === undefined) continue
    if (seenClass.has(classNo)) {
      issues.push({ level: 'error', code: 'DUPLICATE_CLASS', classNo, message: `${classNo}반 파일이 두 번 들어왔습니다 (${seenClass.get(classNo)}, ${f.fileName}).` })
    } else seenClass.set(classNo, f.fileName)
  }

  const profile: ProfileId = sheets.length ? 'regular-exam' : 'performance'
  const first = classFiles[0]!
  const summary = summaries[0]
  const meta: ExamMeta = { ...first.meta, ...(summary ? { examName: summary.meta.examName ?? first.meta.examName, subject: summary.meta.subject ?? first.meta.subject, fullScore: summary.meta.fullScore, teachers: summary.meta.teachers } : {}) }
  delete meta.classNo

  const areas: Area[] =
    profile === 'regular-exam'
      ? [{ id: 'total', name: '영역총점', maxScore: meta.fullScore ?? 100, weightPct: null, isTotal: true }]
      : (first as PerformanceClassFile).areas
  const items: Item[] = profile === 'regular-exam' ? (first as AnswerSheetFile).items : []

  const students = classFiles
    .flatMap((f) => f.students)
    .map((s) => ({ ...s, signRequired: defaultSignRequired(s) }))
    .sort((a, b) => a.classNo - b.classNo || a.number - b.number)
  const classNos = [...new Set(students.map((s) => s.classNo))].sort((a, b) => a - b)

  const classStats: Assessment['classStats'] = {}
  for (const c of classNos) classStats[c] = statsByArea(students.filter((s) => s.classNo === c), areas)

  let gradeStats: Record<string, Summary>
  let gradeCoverage: Assessment['gradeCoverage']
  if (summary) {
    const all = [...summary.scores.values()].flatMap((m) => [...m.values()])
    gradeStats = { total: summarize(all) }
    gradeCoverage = { classNos: summary.classNos, wholeGrade: true }
  } else {
    gradeStats = statsByArea(students, areas)
    gradeCoverage = { classNos, wholeGrade: null }
  }

  const assessment: Assessment = { profile, meta, areas, items, students, classNos, classStats, gradeStats, gradeCoverage, files: parsed }
  issues.push(...validateAssessment(assessment))
  return { assessment, issues, rejected }
}
