import type { Assessment } from '../import/assemble'
import type { AnswerSheetFile, GradeSummaryFile, PerformanceClassFile, ValidationIssue } from '../import/types'
import { neisTotalAverage } from '../stats/display'
import { summarize } from '../stats/stats'

// NEIS prints totals and averages rounded to one decimal place.
const TOL = 0.051
const close = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol

export function validateAssessment(a: Assessment): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const sheets = a.files.filter((f): f is AnswerSheetFile => f.kind === 'answer-sheet')
  const perfs = a.files.filter((f): f is PerformanceClassFile => f.kind === 'performance-class')
  const summary = a.files.find((f): f is GradeSummaryFile => f.kind === 'grade-summary')

  checkMeta(a, issues)
  checkDuplicateStudents(a, issues)
  checkSpecialStatus(a, issues)

  if (a.profile === 'regular-exam') {
    checkItemsConsistent(sheets, issues)
    if (summary) {
      checkAgainstGradeSummary(a, summary, issues)
      if (summary.classNos.length > a.classNos.length)
        issues.push({
          level: 'info',
          code: 'PARTIAL_CLASSES_WITH_SUMMARY',
          message: `학년 평균은 학년 전체 일람표(${summary.classNos.length}개 반)로 계산합니다. 문항별 정답률과 문항 분석은 정오표를 넣은 ${a.classNos.length}개 반(${a.classNos.join(', ')}반) 기준입니다.`
        })
    } else
      issues.push({ level: 'warning', code: 'NO_GRADE_SUMMARY', message: '학년 전체 일람표가 없어 학년 평균은 가져온 반 기준으로 계산합니다.' })
  } else {
    checkAreasConsistent(perfs, issues)
    for (const f of perfs) checkPerformanceFile(f, issues)
    issues.push({
      level: 'info',
      code: 'CONFIRM_WHOLE_GRADE',
      message: `학년 평균은 가져온 ${a.classNos.length}개 반(${a.classNos.join(', ')}반) 기준입니다. 학년 전체 반을 모두 넣었는지 확인하세요.`
    })
  }
  return issues
}

function checkMeta(a: Assessment, issues: ValidationIssue[]) {
  const keys = ['schoolYear', 'semester', 'grade', 'subject'] as const
  for (const k of keys) {
    const values = new Set(a.files.map((f) => f.meta[k]).filter((v) => v !== undefined))
    if (values.size > 1)
      issues.push({ level: 'error', code: 'META_MISMATCH', message: `파일마다 ${label(k)} 값이 다릅니다: ${[...values].join(' / ')}` })
  }
  for (const f of a.files) {
    const fileClass = f.meta.classNo
    if (f.kind === 'grade-summary' || fileClass === undefined) continue
    const students = 'students' in f ? f.students : []
    const bad = students.find((s) => s.classNo !== fileClass)
    if (bad && f.meta.unitLabel !== '강의실')
      issues.push({ level: 'warning', code: 'CLASS_MISMATCH', classNo: fileClass, message: `${f.fileName}: 제목은 ${fileClass}반인데 ${bad.classNo}반 학생이 있습니다.` })
  }
}

function label(k: string) {
  return ({ schoolYear: '학년도', semester: '학기', grade: '학년', subject: '과목' } as Record<string, string>)[k] ?? k
}

function checkDuplicateStudents(a: Assessment, issues: ValidationIssue[]) {
  const seen = new Set<string>()
  for (const s of a.students) {
    if (seen.has(s.key))
      issues.push({ level: 'error', code: 'DUPLICATE_STUDENT', studentKey: s.key, classNo: s.classNo, message: `${s.classNo}반 ${s.number}번 학생이 두 번 나옵니다.` })
    seen.add(s.key)
  }
}

function checkSpecialStatus(a: Assessment, issues: ValidationIssue[]) {
  for (const s of a.students) {
    if (!s.specialStatus) continue
    issues.push({
      level: s.signRequired ? 'warning' : 'info',
      code: 'SPECIAL_STATUS',
      studentKey: s.key,
      classNo: s.classNo,
      message: `${s.classNo}반 ${s.number}번 ${s.name}: 점수 대신 '${s.specialStatus}'${s.signRequired ? ' — 서명 대상인지 확인하세요.' : ' — 서명 제외, 평균 계산 제외.'}`
    })
  }
}

function checkItemsConsistent(sheets: AnswerSheetFile[], issues: ValidationIssue[]) {
  const sig = (f: AnswerSheetFile) => f.items.map((i) => `${i.no}:${i.answer}:${i.points}`).join('|')
  const base = sheets[0]
  for (const f of sheets.slice(1)) {
    if (base && sig(f) !== sig(base))
      issues.push({ level: 'error', code: 'ITEMS_MISMATCH', message: `${f.fileName}: 문항 정답·배점이 다른 반 파일과 다릅니다.` })
  }
}

function checkAgainstGradeSummary(a: Assessment, summary: GradeSummaryFile, issues: ValidationIssue[]) {
  for (const s of a.students) {
    const listed = summary.scores.get(s.classNo)?.get(s.number)
    const own = s.scores.total
    if (typeof own === 'number' && listed === undefined)
      issues.push({ level: 'error', code: 'MISSING_IN_SUMMARY', studentKey: s.key, classNo: s.classNo, message: `${s.classNo}반 ${s.number}번이 학년 일람표에 없습니다.` })
    else if (typeof own === 'number' && listed !== undefined && !close(own, listed, 0.001))
      issues.push({ level: 'error', code: 'SCORE_MISMATCH', studentKey: s.key, classNo: s.classNo, message: `${s.classNo}반 ${s.number}번 점수가 다릅니다 (정오표 ${own}, 일람표 ${listed}).` })
  }
  for (const classNo of a.classNos) {
    const listed = summary.scores.get(classNo)
    if (!listed) {
      issues.push({ level: 'error', code: 'CLASS_NOT_IN_SUMMARY', classNo, message: `${classNo}반이 학년 일람표에 없습니다.` })
      continue
    }
    for (const [number] of listed) {
      if (!a.students.some((s) => s.classNo === classNo && s.number === number))
        issues.push({ level: 'error', code: 'MISSING_IN_SHEET', classNo, message: `${classNo}반 ${number}번이 일람표에는 있는데 정오표에는 없습니다.` })
    }
  }
  for (const [classNo, p] of summary.printed) {
    const st = summarize([...(summary.scores.get(classNo)?.values() ?? [])])
    if (p.count !== null && p.count !== st.count)
      issues.push({ level: 'error', code: 'COUNT_MISMATCH', classNo, message: `${classNo}반 응시생수가 맞지 않습니다 (표기 ${p.count}, 계산 ${st.count}).` })
    if (p.total !== null && !close(p.total, st.total))
      issues.push({ level: 'error', code: 'TOTAL_MISMATCH', classNo, message: `${classNo}반 총점이 맞지 않습니다 (표기 ${p.total}, 계산 ${st.total}).` })
    if (p.average !== null && st.mean !== null && !close(p.average, st.mean))
      issues.push({ level: 'error', code: 'AVERAGE_MISMATCH', classNo, message: `${classNo}반 평균이 맞지 않습니다 (표기 ${p.average}, 계산 ${st.mean.toFixed(2)}).` })
  }
}

function checkAreasConsistent(files: PerformanceClassFile[], issues: ValidationIssue[]) {
  const sig = (f: PerformanceClassFile) => f.areas.map((x) => `${x.name}:${x.maxScore}:${x.weightPct}`).join('|')
  const base = files[0]
  for (const f of files.slice(1)) {
    if (base && sig(f) !== sig(base))
      issues.push({ level: 'error', code: 'AREAS_MISMATCH', message: `${f.fileName}: 평가 영역 구성이 다른 반 파일과 다릅니다.` })
  }
}

function checkPerformanceFile(f: PerformanceClassFile, issues: ValidationIssue[]) {
  const classNo = f.students[0]?.classNo
  const parts = f.areas.filter((x) => !x.isTotal)
  for (const s of f.students) {
    const vals = parts.map((p) => s.scores[p.id])
    const total = s.scores.total
    if (vals.every((v) => typeof v === 'number') && typeof total === 'number') {
      const sum = (vals as number[]).reduce((x, y) => x + y, 0)
      if (!close(sum, total, 0.001))
        issues.push({ level: 'error', code: 'AREA_SUM_MISMATCH', studentKey: s.key, classNo: s.classNo, message: `${s.classNo}반 ${s.number}번: 영역 합(${sum})과 합계(${total})가 다릅니다.` })
    }
    for (const p of parts) {
      const v = s.scores[p.id]
      if (typeof v === 'number' && p.maxScore !== null && (v < 0 || v > p.maxScore))
        issues.push({ level: 'error', code: 'SCORE_OUT_OF_RANGE', studentKey: s.key, classNo: s.classNo, message: `${s.classNo}반 ${s.number}번: '${p.name}' 점수 ${v}가 만점 ${p.maxScore}을 넘습니다.` })
    }
  }
  const means: Record<string, number | null> = {}
  for (const area of f.areas) {
    const values = f.students.flatMap((s) => (typeof s.scores[area.id] === 'number' ? [s.scores[area.id] as number] : []))
    const st = summarize(values)
    means[area.id] = st.mean
    const pc = f.printed.count[area.id]
    const pt = f.printed.total[area.id]
    const pa = f.printed.average[area.id]
    // NEIS prints the 합계 average as the sum of the area averages (each truncated to 2 decimals),
    // rounded to 1 decimal. Confirmed on all 7 sample classes.
    const expected = area.isTotal ? neisTotalAverage(parts.map((p) => means[p.id] ?? null)) : st.mean
    if (pc !== undefined && pc !== st.count)
      issues.push({ level: 'error', code: 'COUNT_MISMATCH', classNo, message: `${classNo}반 '${area.name}' 응시생수가 맞지 않습니다 (표기 ${pc}, 계산 ${st.count}).` })
    if (pt !== undefined && !close(pt, st.total))
      issues.push({ level: 'error', code: 'TOTAL_MISMATCH', classNo, message: `${classNo}반 '${area.name}' 총점이 맞지 않습니다 (표기 ${pt}, 계산 ${st.total}).` })
    if (pa !== undefined && expected !== null && !close(pa, expected))
      issues.push({ level: 'error', code: 'AVERAGE_MISMATCH', classNo, message: `${classNo}반 '${area.name}' 평균이 맞지 않습니다 (표기 ${pa}, 계산 ${expected.toFixed(2)}).` })
  }
}
