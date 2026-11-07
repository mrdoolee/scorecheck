// Builds a new PDF = original 일람표 + signatures drawn as vector strokes inside each student's 비고 cell.
// The original bytes are only read; output is always rebuilt from the original (never from a previous output).
import { LineCapStyle, LineJoinStyle, PDFDocument, rgb } from 'pdf-lib'
import type { Stroke } from '../signature/signature'
import { paddingFor, type RemarkCell } from './detect'

export interface PlacedSignature {
  cell: RemarkCell
  canvas: { w: number; h: number }
  strokes: Stroke[]
}

export interface FittedPath {
  d: string
  lineWidth: number
  /** Top-left of the SVG coordinate space, in PDF points. */
  originX: number
  originY: number
}

/** Fits strokes into the cell: crop to ink, keep aspect ratio, centre, stay inside the padding. */
export function fitSignature(sig: PlacedSignature): FittedPath | null {
  const pts = sig.strokes.flat()
  if (!pts.length) return null
  const px = (p: [number, number, number]) => [p[0] * sig.canvas.w, p[1] * sig.canvas.h] as const
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    const [x, y] = px(p)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const r = sig.cell.rect
  const pad = paddingFor(r)
  const innerH = r.h - 2 * pad.y
  const lineWidth = Math.max(0.8, Math.min(1.4, innerH * 0.09))
  const boxW = r.w - 2 * pad.x - lineWidth
  const boxH = innerH - lineWidth
  const bw = Math.max(maxX - minX, 1)
  const bh = Math.max(maxY - minY, 1)
  const scale = Math.min(boxW / bw, boxH / bh)
  const offX = pad.x + lineWidth / 2 + (boxW - bw * scale) / 2
  const offY = pad.y + lineWidth / 2 + (boxH - bh * scale) / 2
  const f = (n: number) => n.toFixed(2)
  const d = sig.strokes
    .map((s) => {
      const coords = s.map((p) => {
        const [x, y] = px(p)
        return [offX + (x - minX) * scale, offY + (y - minY) * scale] as const
      })
      if (coords.length === 1) coords.push([coords[0]![0] + 0.05, coords[0]![1]])
      return 'M' + coords.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')
    })
    .join(' ')
  return { d, lineWidth, originX: r.x, originY: r.y + r.h }
}

export async function composePdf(original: Uint8Array, signatures: PlacedSignature[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original.slice(), { updateMetadata: false })
  for (const sig of signatures) {
    const fitted = fitSignature(sig)
    if (!fitted) continue
    const page = pdf.getPage(sig.cell.page)
    page.drawSvgPath(fitted.d, {
      x: fitted.originX,
      y: fitted.originY,
      borderColor: rgb(0.05, 0.05, 0.08),
      borderWidth: fitted.lineWidth,
      borderLineCap: LineCapStyle.Round,
      // @ts-expect-error -- supported by pdf-lib at runtime for paths; keeps corners smooth
      borderLineJoin: LineJoinStyle.Round
    })
  }
  return pdf.save({ useObjectStreams: false })
}
