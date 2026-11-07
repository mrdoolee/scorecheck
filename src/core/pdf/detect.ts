// Finds the 비고 cell of every student row in a NEIS 일람표 PDF.
// Rows are anchored by the printed 반/번호 text ("3/12"), never by row order, because numbers can be missing.
// The original PDF is only read here.
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, PDFRef } from 'pdf-lib'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface TextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

export interface RemarkCell {
  key: string
  classNo: number
  number: number
  page: number // 0-based
  rect: Rect
  /** The whole printed row of this student (left edge of the table to the 비고 cell). Used for the student preview. */
  row?: Rect
}

export interface PdfDetection {
  classNo: number | null
  cells: RemarkCell[]
  /** Inner aspect (width / height) of a typical 비고 cell, after padding. */
  cellAspect: number | null
  /** page (0-based) -> the table header band (column titles), for the student preview. */
  headers?: Record<number, Rect>
  issues: string[]
}

type PdfjsModule = typeof import('pdfjs-dist')

// ------------------------------------------------------------ content stream rectangles

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)$/

/** Extracts `re` rectangles from a page content stream, applying `cm` and q/Q graphics state. */
export function parseRects(content: string): Rect[] {
  const rects: Rect[] = []
  const stack: number[][] = []
  let ctm = [1, 0, 0, 1, 0, 0]
  const nums: number[] = []
  // Skip string literals and inline text so their bytes cannot be mistaken for operators.
  const tokens = content.replace(/\((?:\\.|[^\\)])*\)/g, ' ').replace(/<[0-9A-Fa-f\s]*>/g, ' ').split(/\s+/)
  const mul = (a: number[], b: number[]) => [
    a[0]! * b[0]! + a[1]! * b[2]!, a[0]! * b[1]! + a[1]! * b[3]!,
    a[2]! * b[0]! + a[3]! * b[2]!, a[2]! * b[1]! + a[3]! * b[3]!,
    a[4]! * b[0]! + a[5]! * b[2]! + b[4]!, a[4]! * b[1]! + a[5]! * b[3]! + b[5]!
  ]
  for (const t of tokens) {
    if (!t) continue
    if (NUM.test(t)) {
      nums.push(Number(t))
      continue
    }
    if (t === 'q') stack.push(ctm)
    else if (t === 'Q') ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
    else if (t === 'cm' && nums.length >= 6) ctm = mul(nums.slice(-6), ctm)
    else if (t === 're' && nums.length >= 4) {
      const [x, y, w, h] = nums.slice(-4) as [number, number, number, number]
      // Only axis-aligned transforms are expected in NEIS output.
      const x0 = ctm[0]! * x + ctm[4]!, y0 = ctm[3]! * y + ctm[5]!
      const x1 = ctm[0]! * (x + w) + ctm[4]!, y1 = ctm[3]! * (y + h) + ctm[5]!
      rects.push({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) })
    }
    nums.length = 0
  }
  return rects
}

async function pageContents(pdf: PDFDocument, index: number): Promise<string> {
  const node = pdf.getPage(index).node
  const contents = node.Contents()
  const streams: PDFRawStream[] = []
  const add = (o: unknown) => {
    const v = o instanceof PDFRef ? pdf.context.lookup(o) : o
    if (v instanceof PDFRawStream) streams.push(v)
  }
  if (contents instanceof PDFArray) for (let i = 0; i < contents.size(); i++) add(contents.get(i))
  else add(contents)
  return streams.map((s) => Buffer.from(decodePDFRawStream(s).decode()).toString('latin1')).join('\n')
}

// ------------------------------------------------------------ detection

const ANCHOR = /^\s*(\d+)\s*\/\s*(\d+)\s*$/
const near = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol
const contains = (r: Rect, x: number, y: number) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5

export function findRemarkCells(pages: { items: TextItem[]; rects: Rect[] }[]): PdfDetection {
  const issues: string[] = []
  const cells: RemarkCell[] = []
  const classes = new Set<number>()
  const headers: Record<number, Rect> = {}

  pages.forEach(({ items, rects }, page) => {
    const header = items.find((i) => i.str.replace(/\s/g, '') === '비고')
    const headerX = header ? header.x + header.width / 2 : null
    for (const it of items) {
      const m = ANCHOR.exec(it.str)
      if (!m) continue
      const classNo = Number(m[1]), number = Number(m[2])
      const cx = it.x + Math.min(it.width, 8) / 2, cy = it.y + 2
      // The anchor's own cell: the smallest short rectangle containing the text.
      const own = rects
        .filter((r) => r.h > 6 && r.h < 30 && contains(r, cx, cy))
        .sort((a, b) => a.w * a.h - b.w * b.h)[0]
      if (!own) {
        issues.push(`${classNo}반 ${number}번: 표 칸을 찾지 못했습니다.`)
        continue
      }
      const row = rects.filter((r) => near(r.y, own.y) && near(r.h, own.h) && r.w > 4).sort((a, b) => a.x - b.x)
      const byHeader = headerX !== null ? row.find((r) => headerX >= r.x && headerX <= r.x + r.w) : undefined
      const rightmost = row[row.length - 1]!
      if (byHeader && byHeader !== rightmost) issues.push(`${classNo}반 ${number}번: '비고' 머리글 열과 맨 오른쪽 열이 다릅니다.`)
      const cell = byHeader ?? rightmost
      classes.add(classNo)
      const left = row[0]!.x
      cells.push({ key: `${classNo}-${number}`, classNo, number, page, rect: cell, row: { x: left, y: own.y, w: cell.x + cell.w - left, h: own.h } })
    }
    const band = headerBand(header, rects, cells.filter((c) => c.page === page))
    if (band) headers[page] = band
  })

  if (!cells.length) issues.push('반/번호가 적힌 학생 행을 찾지 못했습니다. 지원하지 않는 PDF일 수 있습니다.')
  if (classes.size > 1) issues.push(`한 PDF에 여러 반(${[...classes].join(', ')})이 섞여 있습니다.`)
  const widths = cells.map((c) => c.rect.w).sort((a, b) => a - b)
  const heights = cells.map((c) => c.rect.h).sort((a, b) => a - b)
  const mid = (a: number[]) => a[Math.floor(a.length / 2)]
  const w = mid(widths), h = mid(heights)
  const pad = paddingFor({ x: 0, y: 0, w: w ?? 0, h: h ?? 0 })
  return {
    classNo: classes.size === 1 ? [...classes][0]! : null,
    cells,
    cellAspect: w && h ? (w - 2 * pad.x) / (h - 2 * pad.y) : null,
    headers,
    issues
  }
}

/**
 * Column-title band of a page: from the top of the topmost student row up to the top of the '비고' title cell
 * (which spans every header level). Null when the page has no '비고' title or no student rows.
 */
function headerBand(header: TextItem | undefined, rects: Rect[], pageCells: RemarkCell[]): Rect | null {
  if (!header || !pageCells.length) return null
  const cx = header.x + header.width / 2, cy = header.y + 2
  const own = rects.filter((r) => r.h > 6 && contains(r, cx, cy)).sort((a, b) => a.w * a.h - b.w * b.h)[0]
  const rows = pageCells.map((c) => c.row).filter((r): r is Rect => !!r)
  if (!own || !rows.length) return null
  const top = own.y + own.h
  const bottom = Math.max(...rows.map((r) => r.y + r.h))
  const left = Math.min(...rows.map((r) => r.x))
  const right = Math.max(...rows.map((r) => r.x + r.w))
  if (top - bottom < 4 || top - bottom > 120) return null
  return { x: left, y: bottom, w: right - left, h: top - bottom }
}

/** Inner padding of a 비고 cell so the signature never touches the printed borders. */
export function paddingFor(r: Rect) {
  return { x: Math.min(3, r.w * 0.06), y: Math.min(1.2, r.h * 0.09) }
}

/** Reads text positions (via pdf.js) and rectangles (via pdf-lib) from every page, then detects 비고 cells. */
export async function detectPdf(bytes: Uint8Array, pdfjs: PdfjsModule): Promise<PdfDetection> {
  const task = pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, verbosity: 0 })
  const doc = await task.promise
  const lib = await PDFDocument.load(bytes, { updateMetadata: false })
  const pages: { items: TextItem[]; rects: Rect[] }[] = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i)
      const tc = await p.getTextContent()
      const items = tc.items.flatMap((it) =>
        'str' in it && it.str.trim()
          ? [{ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number, width: it.width, height: it.height }]
          : []
      )
      pages.push({ items, rects: parseRects(await pageContents(lib, i - 1)) })
    }
  } finally {
    await task.destroy()
  }
  return findRemarkCells(pages)
}
