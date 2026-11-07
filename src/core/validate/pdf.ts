import type { StudentRecord, ValidationIssue } from '../import/types'
import type { PdfDetection } from '../pdf/detect'

export interface DetectedPdf {
  fileName: string
  detection: PdfDetection
}

/** Cross-checks the 일람표 PDFs against the imported students. */
export function validatePdfs(pdfs: DetectedPdf[], students: (StudentRecord & { signRequired: boolean })[], classNos: number[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const byClass = new Map<number, DetectedPdf>()
  for (const p of pdfs) {
    const c = p.detection.classNo
    if (c === null) {
      issues.push({ level: 'error', code: 'PDF_UNREADABLE', message: `${p.fileName}: ${p.detection.issues[0] ?? '반을 알 수 없는 PDF입니다.'}` })
      continue
    }
    for (const msg of p.detection.issues) issues.push({ level: 'warning', code: 'PDF_LAYOUT', classNo: c, message: `${p.fileName}: ${msg}` })
    if (byClass.has(c)) {
      issues.push({ level: 'error', code: 'PDF_DUPLICATE_CLASS', classNo: c, message: `${c}반 PDF가 두 개입니다 (${byClass.get(c)!.fileName}, ${p.fileName}).` })
      continue
    }
    if (!classNos.includes(c)) issues.push({ level: 'warning', code: 'PDF_EXTRA_CLASS', classNo: c, message: `${p.fileName}: ${c}반 PDF인데 ${c}반 성적 파일이 없습니다.` })
    byClass.set(c, p)
  }
  for (const c of classNos) {
    const p = byClass.get(c)
    if (!p) {
      issues.push({ level: 'warning', code: 'PDF_MISSING', classNo: c, message: `${c}반 일람표 PDF가 없습니다. 성적 확인은 되지만 ${c}반은 서명을 받을 수 없습니다. 서명을 받으려면 ${c}반 PDF를 함께 넣으세요.` })
      continue
    }
    const keys = new Set(p.detection.cells.map((x) => x.key))
    for (const s of students.filter((x) => x.classNo === c)) {
      if (!keys.has(s.key) && s.signRequired)
        issues.push({ level: 'error', code: 'PDF_NO_ROW', classNo: c, studentKey: s.key, message: `${c}반 ${s.number}번 ${s.name}: PDF에 이 학생 행이 없습니다.` })
    }
    const known = new Set(students.map((x) => x.key))
    for (const cell of p.detection.cells)
      if (!known.has(cell.key))
        issues.push({ level: 'warning', code: 'PDF_EXTRA_ROW', classNo: c, message: `${c}반 ${cell.number}번: PDF에는 있지만 성적 파일에는 없는 학생입니다.` })
  }
  return issues
}
