// Types shared by main, preload, and renderer. Keep this file free of Node/Electron imports.
import type { Area, ExamMeta, FileKind, Item, ProfileId, StudentRecord, ValidationIssue } from '../core/import/types'
import type { Summary } from '../core/stats/stats'
import type { SignaturePayload } from '../core/signature/signature'
import type { ItemInfo } from '../core/item-analysis/info'

export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ImportedFileInfo {
  fileName: string
  kind: FileKind | 'pdf'
  classNo?: number
}

export interface ImportView {
  profile: ProfileId
  meta: ExamMeta
  areas: Area[]
  items: Item[]
  classNos: number[]
  students: (StudentRecord & { signRequired: boolean })[]
  classStats: Record<number, Record<string, Summary>>
  gradeStats: Record<string, Summary>
  gradeCoverage: { classNos: number[]; wholeGrade: boolean | null }
  /** Typical inner width/height of the 비고 cell in the imported PDFs (null when no PDF). */
  cellAspect: number | null
}

export interface ImportResponse {
  view: ImportView | null
  files: ImportedFileInfo[]
  issues: ValidationIssue[]
  rejected: { fileName: string; reason: string }[]
}

export type PhoneStartResult =
  | { ok: true; url: string; pageQr: string; wifiQr: string; ssid: string; passphrase: string }
  | { ok: false; error: string }

export interface WorkSummary {
  workId: string
  workName: string
  createdAt: string
  students: number
  signed: number
}

export interface StoredWorkInfo {
  workId: string
  workName: string
  createdAt: string
  wholeGradeConfirmed: boolean
  /** classNo -> stored 일람표 PDF. A class without one cannot collect signatures. */
  pdfs?: Record<number, unknown>
}

export interface ScoreCheckApi {
  pickFiles(): Promise<string[]>
  importPaths(paths: string[]): Promise<ImportResponse>
  pathForFile(file: File): string
  setStudentMode(on: boolean): Promise<boolean>
  createWork(d: { workName: string; wholeGradeConfirmed: boolean; view: ImportView; sourcePaths: string[] }): Promise<{ workId: string; pdfs?: Record<number, unknown> }>
  saveProgress(workId: string, progress: unknown): Promise<boolean>
  saveSignature(workId: string, studentKey: string, payload: SignaturePayload): Promise<{ ok: boolean; revision?: number; error?: string }>
  phoneStart(): Promise<PhoneStartResult>
  phoneStop(): Promise<boolean>
  /** `rowImage`: PNG data URL of the student's own 일람표 row (header + row), shown on top of the phone page. */
  phoneRequest(workId: string, studentKey: string, label: string, aspect: number, rowImage: string | null): Promise<{ ok: boolean; connected?: boolean; error?: string }>
  phoneIdle(): Promise<boolean>
  phoneState(): Promise<{ running: boolean; connected: boolean; url: string | null }>
  onPhoneConnection(cb: (connected: boolean) => void): () => void
  onPhoneSaved(cb: (e: { studentKey: string; revision: number }) => void): () => void
  pdfCompose(workId: string, classNo: number): Promise<
    | { ok: true; bytes: Uint8Array; fileName: string; signed: number; missing: { number: number; name: string }[] }
    | { ok: false; error: string }
  >
  /**
   * The student's own row in the original 일람표 PDF, for the preview shown before signing.
   * Returns that class PDF plus the rectangles to cut out (PDF points); the screen draws only those parts.
   */
  pdfRowPreview(workId: string, studentKey: string): Promise<
    | { ok: true; bytes: Uint8Array; page: number; header: PdfRect | null; row: PdfRect; remark: PdfRect }
    | { ok: false; error: string }
  >
  /** `skipped`: one teacher-facing line per class that was not saved (multi-class save only). */
  pdfSave(workId: string, classNos: number[]): Promise<{ ok: boolean; paths?: string[]; skipped?: string[]; canceled?: boolean; error?: string }>
  showInFolder(path: string): Promise<void>
  listWorks(): Promise<WorkSummary[]>
  openWork(workId: string): Promise<
    | { ok: true; work: StoredWorkInfo; view: ImportView; progress: { checked: Record<string, boolean>; signed: Record<string, boolean> }; itemInfo: ItemInfo | null }
    | { ok: false; error: string }
  >
  /** Saves 문항정보 for a work; null clears it. */
  itemInfoSave(workId: string, info: ItemInfo | null): Promise<{ ok: boolean; error?: string }>
  /** Writes the aggregate item-analysis xlsx (no student names) to a place the teacher picks. */
  /** Saves a diagnostic report without personal data (versions, hotspot support, error codes). */
  /** Records an error code (no message) for the diagnostics report. */
  reportError(code: string): Promise<void>
  saveDiagnostics(): Promise<{ ok: boolean; path?: string; canceled?: boolean; text?: string; error?: string }>
  analysisExport(workId: string): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>
  deleteWork(workId: string): Promise<{ ok: boolean; error?: string }>
  /** Deletes every received signature of a work (and the PDFs composed inside the work folder). */
  deleteSignatures(workId: string): Promise<{ ok: boolean; error?: string }>
}

declare global {
  interface Window {
    api: ScoreCheckApi
  }
}
