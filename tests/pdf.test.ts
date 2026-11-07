import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { detectPdf, parseRects } from '../src/core/pdf/detect'
import { composePdf, fitSignature } from '../src/core/pdf/compose'

const root = path.resolve(__dirname, '..', 'sample_data')
const has = fs.existsSync(root)
const require_ = createRequire(__filename)
let pdfjs: typeof import('pdfjs-dist')

beforeAll(async () => {
  pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require_.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
})

const sha = (b: Uint8Array) => crypto.createHash('sha256').update(b).digest('hex')
const zigzag = [[[0.1, 0.6, 0], [0.3, 0.2, 10], [0.5, 0.7, 20], [0.7, 0.3, 30], [0.9, 0.5, 40]]] as [number, number, number][][]

describe('parseRects', () => {
  it('applies cm and q/Q and ignores numbers inside strings', () => {
    const r = parseRects('q 1 0 0 1 10 20 cm 0 0 5 6 re f Q (12 34 56 78 re) Tj 1 2 3 4 re')
    expect(r).toEqual([{ x: 10, y: 20, w: 5, h: 6 }, { x: 1, y: 2, w: 3, h: 4 }])
  })
})

describe('fitSignature', () => {
  it('keeps the drawing inside the cell padding', () => {
    const cell = { key: '1-1', classNo: 1, number: 1, page: 0, rect: { x: 100, y: 200, w: 40, h: 14 } }
    const f = fitSignature({ cell, canvas: { w: 1000, h: 300 }, strokes: zigzag })!
    const nums = f.d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number)
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1)
    expect(Math.min(...xs)).toBeGreaterThan(0)
    expect(Math.max(...xs)).toBeLessThan(40)
    expect(Math.min(...ys)).toBeGreaterThan(0)
    expect(Math.max(...ys)).toBeLessThan(14)
  })
})

const cases = [
  { dir: '', expectWidth: 127.4, count: [29, 28, 28, 28, 28, 28, 28] },
  { dir: 'suhaeng', expectWidth: 39.7, count: [29, 28, 28, 28, 28, 28, 28] }
]

describe.skipIf(!has)('NEIS 일람표 PDFs', () => {
  for (const c of cases) {
    it(`finds every 비고 cell (${c.dir || '정기고사'})`, async () => {
      const dir = path.join(root, c.dir)
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort()
      expect(files).toHaveLength(7)
      const classes: number[] = []
      for (const f of files) {
        const det = await detectPdf(new Uint8Array(fs.readFileSync(path.join(dir, f))), pdfjs)
        expect(det.issues).toEqual([])
        classes.push(det.classNo!)
        expect(det.cells.length).toBe(c.count[det.classNo! - 1])
        for (const cell of det.cells) {
          expect(cell.rect.w).toBeCloseTo(c.expectWidth, 0)
          expect(cell.rect.h).toBeCloseTo(14.1, 0)
          // the student's own row ends at the 비고 cell and has the same height
          expect(cell.row!.x + cell.row!.w).toBeCloseTo(cell.rect.x + cell.rect.w, 1)
          expect(cell.row!.h).toBeCloseTo(cell.rect.h, 1)
          expect(cell.row!.w).toBeGreaterThan(cell.rect.w * 2)
          // the header band sits right above the first row of the page and never overlaps student rows
          const band = det.headers![cell.page]!
          expect(band.y).toBeGreaterThanOrEqual(cell.row!.y + cell.row!.h - 0.5)
          expect(band.h).toBeGreaterThan(8)
        }
        if (process.env['PRINT_BANDS']) console.log(f, JSON.stringify(det.headers), JSON.stringify(det.cells[0]!.row))
      }
      expect(classes.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
    })
  }

  it('composes signatures into a new PDF without touching the original', async () => {
    const file = path.join(root, 'suhaeng', fs.readdirSync(path.join(root, 'suhaeng')).filter((f) => f.endsWith('.pdf')).sort()[0]!)
    const original = new Uint8Array(fs.readFileSync(file))
    const before = sha(original)
    const det = await detectPdf(original, pdfjs)
    const out = await composePdf(original, det.cells.map((cell) => ({ cell, canvas: { w: 900, h: 300 }, strokes: zigzag })))
    expect(sha(original)).toBe(before)
    expect(sha(new Uint8Array(fs.readFileSync(file)))).toBe(before)
    expect(out.length).toBeGreaterThan(original.length)
    // The output is still a valid NEIS sheet with the same rows.
    const again = await detectPdf(out, pdfjs)
    expect(again.cells.map((x) => x.key)).toEqual(det.cells.map((x) => x.key))
  })
})
