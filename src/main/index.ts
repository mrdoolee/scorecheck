import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { importFiles } from '../core/import/assemble'
import { readGrid } from '../core/import/xlsx'
import type { ImportResponse, ImportView } from '../shared/ipc'
import { hasEnoughInk, isValidSignature } from '../core/signature/signature'
import { createWork, deleteSignatures, deleteWork, listWorks, loadSignature, loadWork, readSource, recordExport, saveItemInfo, saveProgress, saveSignature, writeOutput } from './storage'
import { sanitizeInfo } from '../core/item-analysis/info'
import { exportSheets } from '../core/item-analysis/export'
import * as XLSX from 'xlsx'
import { diagnosticReport, recordError } from './diagnostics'
import { removeLegacyCleanupTasks } from './scheduler'
import { encryptionError, migrateToEncrypted } from './secure-store'
import { worksRoot } from './storage'
import { composePdf } from '../core/pdf/compose'
import { detectPdfFile } from './pdf'
import type { PdfDetection } from '../core/pdf/detect'
import { validatePdfs } from '../core/validate/pdf'
import { hotspotErrorText, hotspotStart, hotspotStopIfOurs } from './hotspot'
import { hotspotAddress, PhoneServer, type PhoneFonts } from './phone-server'
import QRCode from 'qrcode'
import crypto from 'node:crypto'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']
// Keep data in %APPDATA%\scorecheck regardless of the display name (the uninstaller removes this folder).
app.setPath('userData', path.join(app.getPath('appData'), 'scorecheck'))
// Development only: automated screenshot runs use their own data folder so they never touch real works.
if (!app.isPackaged && process.env['SCORECHECK_USERDATA']) app.setPath('userData', process.env['SCORECHECK_USERDATA'])
const devUrl = process.env['ELECTRON_RENDERER_URL']

// ------------------------------------------------------------ outbound network lock
// The app must never reach the internet. Only local files (and the dev server in development) load.
function lockNetwork() {
  const allowed = (url: string) =>
    url.startsWith('file:') ||
    url.startsWith('devtools:') ||
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    (isDev && !!devUrl && (url.startsWith(devUrl) || url.startsWith(devUrl.replace('http', 'ws'))))

  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const ok = allowed(details.url)
    if (!ok) console.warn('[blocked]', details.url.slice(0, 80))
    cb({ cancel: !ok })
  })

  const csp = isDev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self' ws:"
    : "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self'"
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
  })
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
}

// ------------------------------------------------------------ window
const EXTERNAL_LINKS = new Set(['https://www.instagram.com/trdoolee', 'https://blog.naver.com/trdoolee'])

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: '몇점',
    icon: path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), app.isPackaged ? 'icon.png' : 'resources/icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // No developer tools in the installed app: they would bypass the student-screen lock.
      devTools: !app.isPackaged
    }
  })
  // Never opens app windows. The two creator links (footer) open in the default browser; nothing else does.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_LINKS.has(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!(isDev && devUrl && url.startsWith(devUrl))) e.preventDefault()
  })
  guardStudentMode(win)
  mainWin = win
  if (isDev && devUrl) win.loadURL(devUrl)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
  if (isDev && process.env['SCORECHECK_SHOT']) devScreenshot(win, process.env['SCORECHECK_SHOT'])
}

// ------------------------------------------------------------ student screen lock
// While a student is looking at their scores, the window is full screen and cannot be closed,
// reloaded, or switched away from with app shortcuts. The 🔒 button in the student view returns to the teacher screen.
let studentMode = false

function guardStudentMode(win: BrowserWindow) {
  win.on('close', (e) => {
    if (studentMode) e.preventDefault()
  })
  win.webContents.on('before-input-event', (e, input) => {
    if (!studentMode) return
    const k = input.key.toLowerCase()
    const blocked =
      k === 'f11' || k === 'escape' || k === 'f5' || k === 'f12' ||
      ((input.control || input.meta) && ['w', 'r', 'q', 'p', 'tab'].includes(k)) ||
      (input.control && input.shift && k === 'i') ||
      (input.alt && (k === 'f4' || k === 'tab'))
    if (blocked) e.preventDefault()
  })
  win.on('leave-full-screen', () => {
    if (studentMode) win.setFullScreen(true)
  })
}

ipcMain.handle('student-mode', (e, on: boolean) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  studentMode = on
  win?.setFullScreen(on)
  return on
})

/** Development only: optionally loads files into the import screen, then saves a screenshot and quits. */
function devScreenshot(win: BrowserWindow, out: string) {
  win.webContents.once('did-finish-load', async () => {
    const raw = process.env['SCORECHECK_SHOT_FILES']
    const files = raw?.startsWith('@') ? fs.readFileSync(raw.slice(1), 'utf8').trim() : raw
    if (files) {
      await new Promise((r) => setTimeout(r, 800))
      await win.webContents.executeJavaScript(
        `window.dispatchEvent(new CustomEvent('scorecheck:dev-load', { detail: ${JSON.stringify(files.split('|'))} }))`
      )
    }
    const student = process.env['SCORECHECK_SHOT_STUDENT']
    if (files && student) {
      await win.webContents.executeJavaScript(
        `window.dispatchEvent(new CustomEvent('scorecheck:dev-student', { detail: { paths: ${JSON.stringify(files.split('|'))}, key: ${JSON.stringify(student)} } }))`
      )
    }
    await new Promise((r) => setTimeout(r, Number(process.env['SCORECHECK_SHOT_WAIT'] ?? 2000)))
    const script = process.env['SCORECHECK_SHOT_SCRIPT']
    if (script) {
      await win.webContents.executeJavaScript(fs.readFileSync(script, 'utf8'))
      await new Promise((r) => setTimeout(r, 2500))
    }
    if (process.env['SCORECHECK_SHOT_SCROLL'])
      await win.webContents.executeJavaScript(`window.scrollTo(0, ${Number(process.env['SCORECHECK_SHOT_SCROLL'])})`)
    await new Promise((r) => setTimeout(r, 800))
    try {
      const dbg = win.webContents.debugger
      dbg.attach('1.3')
      const shot = (await dbg.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })) as { data: string }
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
    } catch (e) {
      console.error('[shot] failed', e)
    }
    app.quit()
  })
}

// ------------------------------------------------------------ import
ipcMain.handle('import:pick', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const r = await dialog.showOpenDialog(win, {
    title: '나이스 성적 파일 선택',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '나이스 성적 파일', extensions: ['xlsx', 'xls', 'pdf'] }]
  })
  return r.canceled ? [] : r.filePaths
})

// Detection results keyed by path + modification time, so re-importing the same files is instant.
const pdfCache = new Map<string, { mtime: number; detection: PdfDetection }>()
async function detectCached(p: string) {
  const mtime = fs.statSync(p).mtimeMs
  const hit = pdfCache.get(p)
  if (hit && hit.mtime === mtime) return hit.detection
  const detection = await detectPdfFile(new Uint8Array(fs.readFileSync(p)))
  pdfCache.set(p, { mtime, detection })
  return detection
}

ipcMain.handle('import:paths', async (_e, paths: string[]): Promise<ImportResponse> => {
  const xlsx = paths.filter((p) => /\.xlsx?$/i.test(p))
  const pdfs = paths.filter((p) => /\.pdf$/i.test(p))
  const others = paths.filter((p) => !/\.(xlsx?|pdf)$/i.test(p))

  const unreadable: ImportResponse['rejected'] = []
  const inputs = xlsx.flatMap((p) => {
    try {
      return [{ fileName: path.basename(p), grid: readGrid(fs.readFileSync(p)) }]
    } catch {
      unreadable.push({ fileName: path.basename(p), reason: '파일을 열 수 없습니다. 다른 프로그램에서 열려 있거나 손상되었을 수 있습니다.' })
      return []
    }
  })
  const result = importFiles(inputs)
  const a = result.assessment

  const detected: { path: string; fileName: string; detection: PdfDetection }[] = []
  for (const p of pdfs) {
    try {
      detected.push({ path: p, fileName: path.basename(p), detection: await detectCached(p) })
    } catch {
      unreadable.push({ fileName: path.basename(p), reason: 'PDF를 읽을 수 없습니다. 나이스 일람표 PDF인지 확인하세요.' })
    }
  }
  const pdfIssues = a ? validatePdfs(detected, a.students, a.classNos) : []
  const aspects = detected.map((d) => d.detection.cellAspect).filter((v): v is number => v !== null).sort((x, y) => x - y)

  const files: ImportResponse['files'] = [
    ...(a?.files ?? []).map((f) => ({
      fileName: f.fileName,
      kind: f.kind,
      classNo: 'students' in f ? f.students[0]?.classNo : undefined
    })),
    ...detected.map((d) => ({ fileName: d.fileName, kind: 'pdf' as const, classNo: d.detection.classNo ?? undefined }))
  ]

  return {
    view: a
      ? {
          profile: a.profile,
          meta: a.meta,
          areas: a.areas,
          items: a.items,
          classNos: a.classNos,
          students: a.students,
          classStats: a.classStats,
          gradeStats: a.gradeStats,
          gradeCoverage: a.gradeCoverage,
          cellAspect: aspects[Math.floor(aspects.length / 2)] ?? null
        }
      : null,
    files,
    issues: [...result.issues, ...pdfIssues],
    rejected: [...unreadable, ...result.rejected, ...others.map((p) => ({ fileName: path.basename(p), reason: '엑셀(xlsx) 또는 PDF 파일만 넣을 수 있습니다.' }))]
  }
})

// ------------------------------------------------------------ work + signatures
ipcMain.handle(
  'work:create',
  async (_e, d: { workName: string; wholeGradeConfirmed: boolean; view: ImportView; sourcePaths: string[] }) => {
    const pdfDetections: Record<string, PdfDetection> = {}
    for (const p of d.sourcePaths.filter((x) => /\.pdf$/i.test(x))) pdfDetections[p] = await detectCached(p)
    return createWork({ ...d, pdfDetections })
  }
)

ipcMain.handle('work:list', () => listWorks())

ipcMain.handle('work:open', (_e, workId: string) => {
  try {
    const w = loadWork(workId)
    if (!w.work || !w.view) return { ok: false, error: '작업을 열 수 없습니다.' }
    return { ok: true, ...w }
  } catch {
    recordError('WORK_OPEN_FAILED')
    return { ok: false, error: '작업을 열 수 없습니다. 이 PC의 같은 Windows 계정에서 만든 작업만 열 수 있습니다.' }
  }
})

ipcMain.handle('work:delete', (_e, workId: string) => {
  try {
    deleteWork(workId)
    return { ok: true }
  } catch {
    recordError('WORK_DELETE_FAILED')
    return { ok: false, error: '작업을 지우지 못했습니다. 이 작업의 파일을 연 프로그램을 닫고 다시 시도하세요.' }
  }
})

ipcMain.handle('work:delete-signatures', (_e, workId: string) => {
  try {
    for (const [slot, v] of slots) if (v.workId === workId) slots.delete(slot)
    deleteSignatures(workId)
    return { ok: true }
  } catch {
    recordError('SIGNATURE_DELETE_FAILED')
    return { ok: false, error: '서명을 지우지 못했습니다. 이 작업의 파일을 연 프로그램을 닫고 다시 시도하세요.' }
  }
})

ipcMain.handle('item-info:save', (_e, workId: string, info: unknown) => {
  try {
    const { view } = loadWork(workId)
    if (!view) return { ok: false, error: '작업을 찾을 수 없습니다.' }
    if (info === null) {
      saveItemInfo(workId, null)
      return { ok: true }
    }
    const clean = sanitizeInfo(info, view.items.length)
    if (!clean) return { ok: false, error: '문항정보 형식이 올바르지 않습니다.' }
    saveItemInfo(workId, { ...clean, updatedAt: new Date().toISOString() })
    return { ok: true }
  } catch {
    return { ok: false, error: '문항정보를 저장하지 못했습니다.' }
  }
})

ipcMain.handle('analysis:export', async (e, workId: string) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  try {
    const { work, view, itemInfo } = loadWork(workId)
    if (!work || !view) return { ok: false, error: '작업을 찾을 수 없습니다.' }
    const wb = XLSX.utils.book_new()
    for (const s of exportSheets(view, itemInfo)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name)
    const fileName = `${safeFileName(`${work.workName} 문항 분석`)}_${dateStamp()}.xlsx`
    const pick = await dialog.showSaveDialog(win, {
      title: '문항 분석 내보내기',
      defaultPath: path.join(app.getPath('documents'), fileName),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (pick.canceled || !pick.filePath) return { ok: false, canceled: true }
    fs.writeFileSync(pick.filePath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
    recordExport(workId, pick.filePath)
    return { ok: true, path: pick.filePath }
  } catch (err) {
    return { ok: false, error: `내보내지 못했습니다: ${(err as Error).message}` }
  }
})

ipcMain.handle('progress:save', (_e, workId: string, progress: unknown) => {
  saveProgress(workId, progress)
  return true
})

ipcMain.handle('signature:save', (_e, workId: string, studentKey: string, payload: unknown) => {
  if (!isValidSignature(payload)) return { ok: false, error: '서명 데이터가 올바르지 않습니다.' }
  if (!hasEnoughInk(payload.strokes)) return { ok: false, error: '서명이 너무 짧습니다. 다시 서명해 주세요.' }
  try {
    const r = saveSignature(workId, { studentKey, requestId: payload.requestId, canvas: payload.canvas, strokes: payload.strokes })
    return { ok: true, revision: r.revision }
  } catch {
    recordError('SIGNATURE_SAVE_FAILED')
    return { ok: false, error: '저장하지 못했습니다. 다시 시도해 주세요.' }
  }
})

// ------------------------------------------------------------ PDF output
/** Save date as YYMMDD, appended to output file names. */
function dateStamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

async function composeClass(workId: string, classNo: number) {
  const { work, view, progress } = loadWork(workId)
  const pdf = work.pdfs[classNo]
  if (!pdf) return { ok: false as const, error: `${classNo}반 일람표 PDF가 없습니다.` }
  const students = view.students.filter((s) => s.classNo === classNo)
  const placed = []
  const missing: { number: number; name: string }[] = []
  for (const s of students) {
    if (!s.signRequired) continue
    const cell = pdf.cells.find((c) => c.key === s.key)
    const sig = progress.signed[s.key] ? loadSignature(workId, s.key) : null
    if (!cell || !sig) {
      missing.push({ number: s.number, name: s.name })
      continue
    }
    placed.push({ cell, canvas: sig.canvas, strokes: sig.strokes as [number, number, number][][] })
  }
  const bytes = await composePdf(readSource(workId, pdf.file), placed)
  const fileName = `${safeFileName(`${work.workName} ${classNo}반 서명`)}_${dateStamp()}.pdf`
  return { ok: true as const, bytes, fileName, signed: placed.length, missing }
}

ipcMain.handle('pdf:compose', async (_e, workId: string, classNo: number) => {
  try {
    return await composeClass(workId, classNo)
  } catch (e) {
    recordError('PDF_COMPOSE_FAILED')
    return { ok: false, error: `PDF를 만들지 못했습니다: ${(e as Error).message}` }
  }
})

// Works made before 0.6.0 stored only the 비고 cells; their row and header bands are detected again once.
const previewCache = new Map<string, PdfDetection>()

ipcMain.handle('pdf:row-preview', async (_e, workId: string, studentKey: string) => {
  try {
    const { work } = loadWork(workId)
    const classNo = Number(String(studentKey).split('-')[0])
    const pdf = work.pdfs[classNo]
    if (!pdf) return { ok: false, error: 'NO_PDF' }
    const bytes = readSource(workId, pdf.file)
    let cell = pdf.cells.find((c) => c.key === studentKey)
    let headers = pdf.headers
    if (!cell?.row || !headers) {
      const ck = `${workId}:${classNo}`
      const det = previewCache.get(ck) ?? (await detectPdfFile(bytes))
      previewCache.set(ck, det)
      cell = det.cells.find((c) => c.key === studentKey)
      headers = det.headers
    }
    if (!cell?.row) return { ok: false, error: 'NO_ROW' }
    return { ok: true, bytes, page: cell.page, header: headers?.[cell.page] ?? null, row: cell.row, remark: cell.rect }
  } catch {
    recordError('ROW_PREVIEW_FAILED')
    return { ok: false, error: 'FAILED' }
  }
})

/** Teacher-facing reason for a failed write outside the work folder (the usual cause: the file is open in a viewer). */
function writeErrorText(err: unknown, fileName: string) {
  const code = (err as NodeJS.ErrnoException).code
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES')
    return `${fileName}: 파일이 다른 프로그램에서 열려 있거나 이 폴더에 저장할 권한이 없습니다. 그 파일을 연 프로그램을 닫거나 다른 폴더를 골라 다시 저장하세요.`
  if (code === 'ENOSPC') return `${fileName}: 디스크 공간이 부족합니다.`
  return `${fileName}: 저장하지 못했습니다. 다른 폴더를 골라 다시 저장하세요.`
}

/** Writes a composed class PDF to `p`. Never throws: returns the saved path or a teacher-facing reason. */
function writeClassPdf(workId: string, r: { bytes: Uint8Array; fileName: string }, p: string) {
  try {
    fs.writeFileSync(p, r.bytes)
  } catch (err) {
    recordError(`PDF_WRITE_${(err as NodeJS.ErrnoException).code ?? 'FAILED'}`)
    return { ok: false as const, error: writeErrorText(err, path.basename(p)) }
  }
  try {
    writeOutput(workId, r.fileName, r.bytes)
    recordExport(workId, p)
  } catch {
    // The teacher's copy is saved; only the app's own record of it failed.
    recordError('PDF_RECORD_FAILED')
  }
  return { ok: true as const, path: p }
}

ipcMain.handle('pdf:save', async (e, workId: string, classNos: number[]) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  try {
    if (classNos.length === 1) {
      const r = await composeClass(workId, classNos[0]!)
      if (!r.ok) return r
      const pick = await dialog.showSaveDialog(win, {
        title: 'PDF 저장',
        defaultPath: path.join(app.getPath('documents'), r.fileName),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (pick.canceled || !pick.filePath) return { ok: false, canceled: true }
      const w = writeClassPdf(workId, r, pick.filePath)
      return w.ok ? { ok: true, paths: [w.path] } : { ok: false, error: w.error }
    }
    const pick = await dialog.showOpenDialog(win, { title: 'PDF를 저장할 폴더 선택', properties: ['openDirectory', 'createDirectory'], defaultPath: app.getPath('documents') })
    if (pick.canceled || !pick.filePaths[0]) return { ok: false, canceled: true }
    const dirPath = pick.filePaths[0]
    const paths: string[] = []
    const skipped: string[] = []
    for (const c of classNos) {
      let r: Awaited<ReturnType<typeof composeClass>>
      try {
        r = await composeClass(workId, c)
      } catch {
        recordError('PDF_COMPOSE_FAILED')
        skipped.push(`${c}반: PDF를 만들지 못해 저장하지 않았습니다.`)
        continue
      }
      if (!r.ok) {
        skipped.push(`${c}반: 일람표 PDF가 없어 저장하지 않았습니다.`)
        continue
      }
      const w = writeClassPdf(workId, r, path.join(dirPath, r.fileName))
      if (w.ok) paths.push(w.path)
      else skipped.push(w.error)
    }
    if (!paths.length) return { ok: false, error: skipped.join('\n') || '저장한 PDF가 없습니다.' }
    return { ok: true, paths, skipped }
  } catch {
    recordError('PDF_SAVE_FAILED')
    return { ok: false, error: 'PDF를 저장하지 못했습니다. 다시 시도하세요.' }
  }
})

ipcMain.handle('diag:error', (_e, code: unknown) => {
  if (typeof code === 'string') recordError(code)
})

ipcMain.handle('diag:save', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const text = await diagnosticReport()
  const pick = await dialog.showSaveDialog(win, {
    title: '진단 정보 저장',
    defaultPath: path.join(app.getPath('documents'), `몇점_진단정보_${dateStamp()}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (pick.canceled || !pick.filePath) return { ok: false, canceled: true }
  try {
    fs.writeFileSync(pick.filePath, text, 'utf8')
  } catch (err) {
    return { ok: false, error: writeErrorText(err, path.basename(pick.filePath)) }
  }
  return { ok: true, path: pick.filePath, text }
})

ipcMain.handle('shell:show', (_e, p: string) => {
  if (typeof p === 'string' && /\.(pdf|xlsx|json)$/i.test(p) && fs.existsSync(p)) shell.showItemInFolder(p)
})

// ------------------------------------------------------------ phone signing
let phone: PhoneServer | null = null
const slots = new Map<string, { workId: string; studentKey: string }>()
let mainWin: BrowserWindow | null = null

function toRenderer(channel: string, payload: unknown) {
  mainWin?.webContents.send(channel, payload)
}

/** The bundled font files, served to the phone so its signing page uses the same font as the PC. */
function phoneFonts(): PhoneFonts {
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'fonts') : path.join(app.getAppPath(), 'resources', 'fonts')
  const read = (f: string) => {
    try {
      return fs.readFileSync(path.join(dir, f))
    } catch {
      return undefined
    }
  }
  return { L: read('HakgyoansimSantteutdotumL.otf'), M: read('HakgyoansimSantteutdotumM.otf') }
}

function wifiQrText(ssid: string, pass: string) {
  // WIFI: QR format escapes \ ; , : " with a backslash.
  const esc = (v: string) => v.replace(/([\\;,:"])/g, '\\$1')
  return `WIFI:T:WPA;S:${esc(ssid)};P:${esc(pass)};;`
}

async function waitForHotspotAddress(ms: number) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const a = hotspotAddress()
    if (a) return a
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

ipcMain.handle('phone:start', async () => {
  if (phone) phone.stop()
  phone = null
  const hs = await hotspotStart()
  if (!hs.ok) {
    recordError(`HOTSPOT_${hs.error ?? 'UNKNOWN'}`)
    return { ok: false, error: hotspotErrorText(hs) }
  }
  const host = await waitForHotspotAddress(15000)
  if (!host) {
    recordError('HOTSPOT_NO_ADDRESS')
    return { ok: false, error: '핫스팟은 켜졌지만 주소를 찾지 못했습니다. 잠시 후 다시 시도하세요.' }
  }
  const server = new PhoneServer({
    onConnection: (connected) => toRenderer('phone:connection', connected),
    onSignature: async (slot, payload) => {
      const target = slots.get(slot)
      if (!target) return { ok: false, error: 'PC에서 학생이 바뀌었습니다.' }
      const r = saveSignature(target.workId, { studentKey: target.studentKey, requestId: payload.requestId, canvas: payload.canvas, strokes: payload.strokes })
      toRenderer('phone:saved', { studentKey: target.studentKey, revision: r.revision })
      return { ok: true, revision: r.revision }
    }
  }, phoneFonts())
  try {
    await server.start(host)
  } catch (e) {
    return { ok: false, error: `서명 서버를 시작하지 못했습니다: ${(e as Error).message}` }
  }
  phone = server
  slots.clear()
  const [pageQr, wifiQr] = await Promise.all([
    QRCode.toDataURL(server.url, { margin: 1, width: 360 }),
    QRCode.toDataURL(wifiQrText(hs.ssid ?? '', hs.passphrase ?? ''), { margin: 1, width: 360 })
  ])
  return { ok: true, url: server.url, pageQr, wifiQr, ssid: hs.ssid ?? '', passphrase: hs.passphrase ?? '' }
})

ipcMain.handle('phone:stop', async () => {
  phone?.stop()
  phone = null
  slots.clear()
  await hotspotStopIfOurs()
  return true
})

/** Only a PNG data URL of a sane size is passed on to the phone; anything else is dropped. */
const MAX_ROW_IMAGE = 3 * 1024 * 1024
function rowImageOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length <= MAX_ROW_IMAGE && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null
}

ipcMain.handle('phone:request', (_e, workId: string, studentKey: string, label: string, aspect: number, rowImage: unknown) => {
  if (!phone) return { ok: false, error: '휴대폰이 연결되어 있지 않습니다.' }
  const slot = crypto.randomBytes(12).toString('hex')
  slots.clear()
  slots.set(slot, { workId, studentKey })
  const image = rowImageOrNull(rowImage)
  phone.send({ type: 'request', slot, label, aspect, ...(image ? { image } : {}) })
  return { ok: true, connected: phone.connected }
})

ipcMain.handle('phone:idle', () => {
  slots.clear()
  phone?.send({ type: 'idle' })
  return true
})

ipcMain.handle('phone:state', () => ({ running: !!phone, connected: !!phone?.connected, url: phone?.url ?? null }))

// ------------------------------------------------------------ lifecycle
// Up to 0.3.0, Task Scheduler started the app with `--cleanup <id>`. Such a start now only removes the old tasks.
const legacyCleanupStart = process.argv.includes('--cleanup')

if (!app.requestSingleInstanceLock()) {
  // Another ScoreCheck is running; it receives our argv via 'second-instance' and does the work.
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    if (argv.includes('--cleanup')) void removeLegacyCleanupTasks()
    else if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore()
      mainWin.focus()
    }
  })

  app.whenReady().then(async () => {
    // Diagnostic: `ScoreCheck.exe --selftest-pdf <file.pdf>` writes the 비고-cell detection next to the file.
    const st = process.argv.indexOf('--selftest-pdf')
    if (st >= 0 && process.argv[st + 1]) {
      const file = process.argv[st + 1]!
      try {
        const det = await detectPdfFile(new Uint8Array(fs.readFileSync(file)))
        fs.writeFileSync(`${file}.selftest.json`, JSON.stringify({ classNo: det.classNo, cells: det.cells.length, cellAspect: det.cellAspect, issues: det.issues }))
      } catch (e) {
        fs.writeFileSync(`${file}.selftest.json`, JSON.stringify({ error: (e as Error).message }))
      }
      app.exit(0)
      return
    }
    if (legacyCleanupStart) {
      // Started by an old Task Scheduler entry: remove the entries, delete nothing, exit.
      await removeLegacyCleanupTasks()
      app.exit(0)
      return
    }
    lockNetwork()
    // No application menu: Electron's default one (shown with Alt) has Reload and Developer Tools.
    Menu.setApplicationMenu(null)
    // Works saved before 0.4.0 are plaintext; encrypt them once (fast: a few MB per work).
    migrateToEncrypted(worksRoot())
    if (encryptionError()) recordError(encryptionError()!)
    createWindow()
    if (app.isPackaged) void removeLegacyCleanupTasks()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => app.quit())

let quitting = false
app.on('before-quit', (e) => {
  if (quitting) return
  quitting = true
  phone?.stop()
  phone = null
  e.preventDefault()
  hotspotStopIfOurs().finally(() => app.quit())
})
