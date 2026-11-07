import { useEffect, useRef, useState } from 'react'
import { hasEnoughInk, type SignaturePayload, type Stroke } from '../../../core/signature/signature'

function newRequestId() {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

/** Signature canvas for touch screen, pen, or mouse. Emits normalised vector strokes. */
export function SignPad({
  aspect,
  onSubmit,
  busy
}: {
  aspect: number
  onSubmit: (p: SignaturePayload) => void
  busy: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const current = useRef<Stroke | null>(null)
  const t0 = useRef(0)
  const requestId = useRef(newRequestId())
  const [empty, setEmpty] = useState(true)
  const [tooShort, setTooShort] = useState(false)

  const redraw = () => {
    const c = canvas.current
    if (!c) return
    const r = c.getBoundingClientRect()
    const d = window.devicePixelRatio || 1
    if (c.width !== Math.round(r.width * d)) {
      c.width = Math.round(r.width * d)
      c.height = Math.round(r.height * d)
    }
    const ctx = c.getContext('2d')!
    ctx.setTransform(d, 0, 0, d, 0, 0)
    ctx.clearRect(0, 0, r.width, r.height)
    ctx.lineWidth = Math.max(2.5, r.height / 60)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
    for (const s of strokes.current) {
      ctx.beginPath()
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x * r.width, y * r.height) : ctx.moveTo(x * r.width, y * r.height)))
      if (s.length === 1) ctx.lineTo(s[0]![0] * r.width + 0.1, s[0]![1] * r.height)
      ctx.stroke()
    }
  }

  useEffect(() => {
    redraw()
    const ro = new ResizeObserver(redraw)
    if (canvas.current) ro.observe(canvas.current)
    return () => ro.disconnect()
  }, [])

  const point = (e: React.PointerEvent): [number, number, number] => {
    const r = canvas.current!.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, Math.round(performance.now() - t0.current)]
  }

  function clear() {
    strokes.current = []
    requestId.current = newRequestId()
    setEmpty(true)
    setTooShort(false)
    redraw()
  }

  function submit() {
    if (!hasEnoughInk(strokes.current)) {
      setTooShort(true)
      return
    }
    const r = canvas.current!.getBoundingClientRect()
    onSubmit({ requestId: requestId.current, canvas: { w: Math.round(r.width), h: Math.round(r.height) }, strokes: strokes.current })
  }

  return (
    <div className="signpad">
      <div className="signpad-box" style={{ aspectRatio: String(aspect) }}>
        <canvas
          ref={canvas}
          onPointerDown={(e) => {
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              /* synthetic or already-released pointer */
            }
            if (!strokes.current.length) t0.current = performance.now()
            current.current = [point(e)]
            strokes.current.push(current.current)
            setEmpty(false)
            setTooShort(false)
            redraw()
          }}
          onPointerMove={(e) => {
            if (!current.current) return
            const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? []
            for (const ev of coalesced.length ? coalesced : [e.nativeEvent]) {
              const r = canvas.current!.getBoundingClientRect()
              current.current.push([(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height, Math.round(performance.now() - t0.current)])
            }
            redraw()
          }}
          onPointerUp={() => (current.current = null)}
          onPointerCancel={() => (current.current = null)}
        />
        {empty && <span className="signpad-hint">여기에 서명하세요</span>}
        <span className="signpad-line" aria-hidden="true" />
      </div>
      {tooShort && <p className="error-text">서명이 너무 짧아요. 이름을 또박또박 써 주세요.</p>}
      <div className="row center">
        <button className="btn big" onClick={clear} disabled={busy || empty}>
          지우기
        </button>
        <button className="btn primary big" onClick={submit} disabled={busy || empty}>
          {busy ? '저장 중…' : '서명 제출'}
        </button>
      </div>
    </div>
  )
}
