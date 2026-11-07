// Shows the student's own line of the original 일람표 PDF (column titles + their row), like a cut-out of the paper.
// The page is drawn on an off-screen canvas and only the two strips are copied to the screen, so no other
// student's row is ever displayed. The off-screen canvas is dropped right after.
import { useEffect, useRef, useState } from 'react'
import type { PdfRect } from '../../../shared/ipc'
import { pdfjs } from './pdfjs'

type Preview = { bytes: Uint8Array; page: number; header: PdfRect | null; row: PdfRect; remark: PdfRect }

/** PDF rectangle (points, y up) -> canvas rectangle (pixels, y down) for a viewport. */
function toCanvas(vp: { convertToViewportPoint(x: number, y: number): number[] }, r: PdfRect) {
  const [x1, y1] = vp.convertToViewportPoint(r.x, r.y) as [number, number]
  const [x2, y2] = vp.convertToViewportPoint(r.x + r.w, r.y + r.h) as [number, number]
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
}

export function RowPreview({
  workId,
  studentKey,
  onImage
}: {
  workId: string
  studentKey: string
  /** Receives the cut-out as a PNG data URL (for the phone signing page), or null when there is none. */
  onImage?: (dataUrl: string | null) => void
}) {
  const holder = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'none'>('loading')
  const onImageRef = useRef(onImage)
  onImageRef.current = onImage

  useEffect(() => {
    let cancelled = false
    let task: ReturnType<typeof pdfjs.getDocument> | null = null
    ;(async () => {
      const r = await window.api.pdfRowPreview(workId, studentKey)
      if (!r.ok) {
        onImageRef.current?.(null)
        return setState('none')
      }
      const p: Preview = r
      task = pdfjs.getDocument({ data: p.bytes.slice() })
      const doc = await task.promise
      const page = await doc.getPage(p.page + 1)
      const el = holder.current
      if (!el || cancelled) return
      const dpr = window.devicePixelRatio || 1
      // Wide enough to read, but never taller than ~140px so the signing pad stays on screen.
      const strip = (p.header?.h ?? 0) + p.row.h
      const cssWidth = Math.min(el.clientWidth || 900, 1000, (140 * p.row.w) / strip)
      const scale = (cssWidth / p.row.w) * dpr
      const vp = page.getViewport({ scale })
      const full = document.createElement('canvas')
      full.width = Math.ceil(vp.width)
      full.height = Math.ceil(vp.height)
      await page.render({ canvas: full, canvasContext: full.getContext('2d')!, viewport: vp }).promise
      if (cancelled) return

      const pad = Math.round(1 * scale) // keep the printed border lines, nothing of the neighbouring rows
      const strips = [p.header, p.row].filter((s): s is PdfRect => !!s).map((s) => toCanvas(vp, s))
      const left = Math.max(0, Math.floor(Math.min(...strips.map((s) => s.x)) - pad))
      const right = Math.min(full.width, Math.ceil(Math.max(...strips.map((s) => s.x + s.w)) + pad))
      const gap = p.header ? Math.round(10 * dpr) : 0
      const out = document.createElement('canvas')
      out.width = right - left
      out.height = strips.reduce((h, s) => h + Math.ceil(s.h) + 2 * pad, 0) + gap
      out.style.width = `${out.width / dpr}px`
      const ctx = out.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, out.width, out.height)
      let y = 0
      strips.forEach((s, i) => {
        const top = Math.max(0, Math.floor(s.y) - pad)
        const h = Math.ceil(s.h) + 2 * pad
        ctx.drawImage(full, left, top, out.width, h, 0, y, out.width, h)
        if (i === strips.length - 1) {
          // Mark the 비고 cell where the signature goes.
          const c = toCanvas(vp, p.remark)
          ctx.save()
          ctx.strokeStyle = '#635bff'
          ctx.lineWidth = 2.5 * dpr
          ctx.setLineDash([6 * dpr, 4 * dpr])
          ctx.strokeRect(c.x - left + 1, c.y - top + y + 1, c.w - 2, c.h - 2)
          ctx.restore()
        }
        y += h + (i === 0 ? gap : 0)
      })
      if (p.header && gap) {
        // A torn-paper hint between the titles and the row: other rows are left out on purpose.
        ctx.save()
        ctx.strokeStyle = '#c4cdd8'
        ctx.setLineDash([4 * dpr, 4 * dpr])
        const mid = Math.ceil(strips[0]!.h) + 2 * pad + gap / 2
        ctx.beginPath()
        ctx.moveTo(0, mid)
        ctx.lineTo(out.width, mid)
        ctx.stroke()
        ctx.restore()
      }
      full.width = full.height = 0
      el.replaceChildren(out)
      setState('ready')
      onImageRef.current?.(out.toDataURL('image/png'))
    })().catch(() => {
      if (cancelled) return
      onImageRef.current?.(null)
      setState('none')
    })
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [workId, studentKey])

  if (state === 'none') return null
  return (
    <section className="sv-card row-preview">
      <h3>일람표 원본에서 내 줄을 확인하세요</h3>
      <p className="hint small">선생님이 학교에 제출하는 일람표 원본에서 내 줄만 잘라 보여 줍니다. 점선 칸(비고)에 서명이 들어갑니다.</p>
      {state === 'loading' && <p className="muted small">원본을 불러오는 중…</p>}
      {/* Filled by the effect only; React never renders children here. */}
      <div className="row-preview-img" ref={holder} />
    </section>
  )
}
